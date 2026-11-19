import { describe, expect, it } from 'vitest'
import {
  baseMetricId,
  mergeTrimPoints,
  normalizeSeriesKey,
  parseSeriesKey,
  trimPoints,
  trimPointsSince,
} from './series.js'

describe('series keys', () => {
  it('normalizes the edge unit-separator component key', () => {
    expect(normalizeSeriesKey('robot.servo.arm\u001fleft')).toBe('robot.servo.arm@left')
    expect(normalizeSeriesKey('robot.servo.camera_deg')).toBe('robot.servo.camera_deg')
  })

  it('parses prometheus, unit-sep and @component keys', () => {
    expect(parseSeriesKey('cpu{core="0"}')).toEqual({ name: 'cpu', labels: { core: '0' } })
    expect(parseSeriesKey('a\u001fb')).toEqual({ name: 'a', labels: { component: 'b' } })
    expect(parseSeriesKey('a@b')).toEqual({ name: 'a', labels: { component: 'b' } })
  })

  it('extracts the base metric id', () => {
    expect(baseMetricId('robot.servo@arm')).toBe('robot.servo')
    expect(baseMetricId('cpu{core="0"}')).toBe('cpu')
  })
})

describe('point trimming', () => {
  const pts = [
    { t: '2026-01-01T00:00:00.000Z', v: 1 },
    { t: '2026-01-01T00:00:01.000Z', v: 2 },
    { t: '2026-01-01T00:00:02.000Z', v: 3 },
  ]

  it('caps length to the newest points', () => {
    expect(trimPoints(pts, 2)).toEqual(pts.slice(1))
  })

  it('drops points older than the window', () => {
    const from = Date.parse('2026-01-01T00:00:01.000Z')
    expect(trimPointsSince(pts, from)).toEqual(pts.slice(1))
  })

  it('merges by timestamp and sorts ascending', () => {
    const merged = mergeTrimPoints(
      [{ t: '2026-01-01T00:00:02.000Z', v: 3 }],
      [
        { t: '2026-01-01T00:00:01.000Z', v: 2 },
        { t: '2026-01-01T00:00:02.000Z', v: 9 },
      ],
    )
    expect(merged).toEqual([
      { t: '2026-01-01T00:00:01.000Z', v: 2 },
      { t: '2026-01-01T00:00:02.000Z', v: 9 },
    ])
  })
})
