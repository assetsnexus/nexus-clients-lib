import { describe, expect, it } from 'vitest'
import { createLiveMetricsClient, type MetricsSocket } from './client.js'

function fakeSocket() {
  let onMessage: ((data: string) => void) | null = null
  let onOpen: (() => void) | null = null
  const sent: string[] = []
  const socket: MetricsSocket = {
    send: (data) => sent.push(data),
    close: () => {},
    onMessage: (h) => {
      onMessage = h
    },
    onOpen: (h) => {
      onOpen = h
    },
    onClose: () => {},
  }
  return {
    socket,
    sent,
    open: () => onOpen && onOpen(),
    emit: (frame: unknown) => onMessage && onMessage(JSON.stringify(frame)),
  }
}

describe('createLiveMetricsClient', () => {
  it('connects on the primary route and ingests frames', async () => {
    const fake = fakeSocket()
    const client = createLiveMetricsClient({
      flushMs: 0,
      fetchRoutes: async () => [
        { id: 'r1', url: 'https://reg:30400', routeType: 'registry_relay', latency: 10 },
        { id: 'p1', url: 'https://edge:28680', routeType: 'p2p_direct', latency: 40 },
      ],
      openSession: async () => ({ sessionId: 's1', baseUrl: 'https://edge:28680' }),
      openSocket: () => fake.socket,
    })
    await client.connect()
    expect(client.getPrimaryRoute()?.id).toBe('p1')
    fake.open()
    expect(fake.sent[0]).toContain('select')
    fake.emit({ seq: 1, samples: { 'robot.servo.arm': [[1000, 5]] } })
    client.getStore().flush()
    expect(client.getStore().getLatest('robot.servo.arm')).toBe(5)
  })

  it('discards late/duplicate frames in parallel mode', async () => {
    const fake = fakeSocket()
    const client = createLiveMetricsClient({
      flushMs: 0,
      fetchRoutes: async () => [{ id: 'p1', url: 'https://edge', routeType: 'p2p_direct' }],
      openSession: async () => ({ sessionId: 's1', baseUrl: 'https://edge' }),
      openSocket: () => fake.socket,
    })
    await client.connect()
    client.setForceParallel(true)
    fake.emit({ seq: 9, samples: { m: [[1000, 1]] } })
    fake.emit({ seq: 9, samples: { m: [[1000, 2]] } })
    client.getStore().flush()
    expect(client.getStore().getSeries('m')).toEqual([{ t: new Date(1000).toISOString(), v: 1 }])
  })

  it('lists cameras and builds a priority-capped MJPEG URL', async () => {
    const fake = fakeSocket()
    const commands: string[] = []
    const client = createLiveMetricsClient({
      flushMs: 0,
      fetchRoutes: async () => [{ id: 'p1', url: 'https://edge', routeType: 'p2p_direct' }],
      openSession: async () => ({ sessionId: 's1', baseUrl: 'https://edge' }),
      openSocket: () => fake.socket,
      fetchCameras: async () => ({ cameras: [{ cameraId: 'usb0', priority: 80 }] } as any),
      cameraCommand: async (_base, id, action) => {
        commands.push(`${id}:${action}`)
        return true
      },
    })
    await client.connect()
    const cams = await client.refreshCameras()
    expect(cams[0].cameraId).toBe('usb0')
    const url = await client.startCamera('usb0', { fps: 60, maxWidth: 640 })
    expect(url).toBe('https://edge/api/streams/mjpeg?camera=usb0&fps=30&maxWidth=640')
    await client.stopCamera('usb0')
    expect(commands).toEqual(['usb0:prepare', 'usb0:sleep'])
  })

  it('loads registry history in chunks', async () => {
    const fake = fakeSocket()
    let calls = 0
    const client = createLiveMetricsClient({
      flushMs: 0,
      fetchRoutes: async () => [{ id: 'p1', url: 'https://edge', routeType: 'p2p_direct' }],
      openSession: async () => ({ sessionId: 's1', baseUrl: 'https://edge' }),
      openSocket: () => fake.socket,
      fetchHistory: async () => {
        calls += 1
        if (calls === 1) {
          return { rows: [{ ts: 1000, metrics: { a: 1 } }], hasMore: true, nextBefore: 'b1' }
        }
        return { rows: [{ ts: 2000, metrics: { a: 2 } }], hasMore: false }
      },
    })
    await client.connect()
    await client.loadHistory({ from: 0, to: 3000 })
    expect(calls).toBe(2)
    expect(client.getStore().getLatest('a')).toBe(2)
  })
})
