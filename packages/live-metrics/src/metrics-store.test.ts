import { describe, expect, it, vi } from 'vitest'
import { createMetricsStore } from './metrics-store.js'

describe('createMetricsStore', () => {
  it('buffers samples and applies them on flush', () => {
    const store = createMetricsStore({ flushMs: 0 })
    store.ingestFrame({
      seq: 1,
      samples: { 'robot.servo.arm': [[1000, 12], [2000, 13]] },
    })
    expect(store.getSeries('robot.servo.arm')).toEqual([])
    store.flush()
    expect(store.getSeries('robot.servo.arm')).toEqual([
      { t: new Date(1000).toISOString(), v: 12 },
      { t: new Date(2000).toISOString(), v: 13 },
    ])
    expect(store.getLatest('robot.servo.arm')).toBe(13)
  })

  it('ingests metrics maps (scalar and {value, component})', () => {
    const store = createMetricsStore({ flushMs: 0 })
    store.ingestFrame({
      ts: 5000,
      metrics: {
        'host.cpu.load_pct': 42,
        'robot.servo.arm': { value: 7, component: 'left' },
      },
    })
    store.flush()
    expect(store.getLatest('host.cpu.load_pct')).toBe(42)
    expect(store.getLatest('robot.servo.arm@left')).toBe(7)
  })

  it('notifies subscribers with changed keys on flush', () => {
    const store = createMetricsStore({ flushMs: 0 })
    const seen: string[][] = []
    store.subscribe((keys) => seen.push(keys))
    store.ingestFrame({ ts: 1, metrics: { a: 1 } })
    store.flush()
    expect(seen).toEqual([['a']])
  })

  it('filters series via acceptSeries', () => {
    const store = createMetricsStore({ flushMs: 0, acceptSeries: (k) => k === 'keep' })
    store.ingestFrame({ ts: 1, metrics: { keep: 1, drop: 2 } })
    store.flush()
    expect(store.getKeys()).toEqual(['keep'])
  })

  it('trims to the visible window on setRange', () => {
    const store = createMetricsStore({ flushMs: 0 })
    store.ingestFrame({ samples: { m: [[1000, 1], [5000, 2]] } })
    store.flush()
    store.setRange(3000)
    expect(store.getSeries('m')).toEqual([{ t: new Date(5000).toISOString(), v: 2 }])
  })

  it('auto-flushes on the timer', async () => {
    vi.useFakeTimers()
    try {
      const store = createMetricsStore({ flushMs: 250 })
      store.start()
      store.ingestFrame({ ts: 1, metrics: { a: 1 } })
      vi.advanceTimersByTime(250)
      expect(store.getLatest('a')).toBe(1)
      store.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
