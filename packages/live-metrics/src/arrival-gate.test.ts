import { describe, expect, it } from 'vitest'
import { createArrivalGate } from './arrival-gate.js'

describe('createArrivalGate', () => {
  it('accepts everything in single-route mode', () => {
    const gate = createArrivalGate()
    expect(gate.consider({ routeId: 'a', seq: 1 }).accepted).toBe(true)
    expect(gate.consider({ routeId: 'a', seq: 1 }).accepted).toBe(true)
  })

  it('first copy of a seq wins; later copies are duplicates', () => {
    const gate = createArrivalGate({ now: () => 1000 })
    expect(gate.consider({ routeId: 'a', seq: 7, forceParallel: true })).toMatchObject({
      accepted: true,
      reason: 'first',
    })
    expect(gate.consider({ routeId: 'b', seq: 7, forceParallel: true })).toMatchObject({
      accepted: false,
      reason: 'duplicate',
    })
  })

  it('falls back to timestamp when seq is missing', () => {
    const gate = createArrivalGate()
    expect(gate.consider({ routeId: 'a', ts: 1000, forceParallel: true }).accepted).toBe(true)
    expect(gate.consider({ routeId: 'b', ts: 900, forceParallel: true })).toMatchObject({
      accepted: false,
      reason: 'delayed',
    })
    expect(gate.consider({ routeId: 'b', ts: 1000, forceParallel: true })).toMatchObject({
      accepted: false,
      reason: 'duplicate',
    })
    expect(gate.consider({ routeId: 'b', ts: 1100, forceParallel: true }).accepted).toBe(true)
  })

  it('accepts untimed frames', () => {
    const gate = createArrivalGate()
    expect(gate.consider({ routeId: 'a', forceParallel: true })).toMatchObject({
      accepted: true,
      reason: 'untimed',
    })
  })

  it('reset clears the watermark', () => {
    const gate = createArrivalGate()
    gate.consider({ routeId: 'a', ts: 1000, forceParallel: true })
    gate.reset()
    expect(gate.consider({ routeId: 'b', ts: 500, forceParallel: true }).accepted).toBe(true)
  })
})
