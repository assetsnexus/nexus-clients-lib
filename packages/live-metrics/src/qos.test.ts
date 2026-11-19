import { describe, expect, it } from 'vitest'
import { coordinateQos, createQosController, rttFromPing } from './qos.js'

describe('qos controller', () => {
  it('reads rtt from a qos.ping packet', () => {
    expect(rttFromPing({ type: 'qos.ping', t: 1000 }, 1120)).toBe(120)
    expect(rttFromPing({ type: 'other' }, 1)).toBeNull()
  })

  it('degrades and recovers one tier at a time', () => {
    const c = createQosController({ streamId: 'cam', priority: 80 })
    expect(c.degrade('fps')).toMatchObject({ fps: 12, width: 854, height: 480 })
    expect(c.degrade('fps')).toMatchObject({ fps: 8, width: 640, height: 360 })
    expect(c.degrade('fps')).toBeNull()
    expect(c.recover('fps')).toMatchObject({ fps: 12 })
  })
})

describe('priority-aware coordination', () => {
  const ctrl = (id: string, priority: number) => createQosController({ streamId: id, priority })

  it('degrades the lowest-priority stream first', () => {
    const main = ctrl('main', 90)
    const telemetry = ctrl('telemetry', 30)
    const state = { lastChangeAt: 0 }
    coordinateQos([main, telemetry], { fps: 10, lowForMs: 1500 }, 5000, state)
    expect(telemetry.step).toBe(1)
    expect(main.step).toBe(0)
  })

  it('keeps degrading the next-lowest before touching the main camera', () => {
    const main = ctrl('main', 90)
    const telemetry = ctrl('telemetry', 30)
    const state = { lastChangeAt: 0 }
    coordinateQos([main, telemetry], { fps: 10, lowForMs: 1500 }, 5000, state)
    coordinateQos([main, telemetry], { fps: 10, lowForMs: 1500 }, 7000, state)
    expect(telemetry.step).toBe(2)
    expect(main.step).toBe(0)
    coordinateQos([main, telemetry], { fps: 10, lowForMs: 1500 }, 9000, state)
    expect(main.step).toBe(1)
  })

  it('recovers the highest-priority stream first', () => {
    const main = ctrl('main', 90)
    const telemetry = ctrl('telemetry', 30)
    main.degrade('fps')
    telemetry.degrade('fps')
    const state = { lastChangeAt: 0 }
    coordinateQos([main, telemetry], { fps: 40, lowForMs: 0 }, 5000, state)
    expect(main.step).toBe(0)
    expect(telemetry.step).toBe(1)
  })

  it('honours the cooldown between coordinated steps', () => {
    const telemetry = ctrl('telemetry', 30)
    const state = { lastChangeAt: 0 }
    coordinateQos([telemetry], { fps: 10, lowForMs: 1500 }, 5000, state)
    coordinateQos([telemetry], { fps: 10, lowForMs: 1500 }, 5500, state)
    expect(telemetry.step).toBe(1)
  })
})
