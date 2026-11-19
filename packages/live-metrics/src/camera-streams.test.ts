import { describe, expect, it } from 'vitest'
import {
  buildMjpegUrl,
  cameraPriority,
  normalizeCameras,
  priorityFpsCap,
  sortCamerasByPriority,
} from './camera-streams.js'

describe('camera streams', () => {
  it('normalizes a /api/cameras payload', () => {
    const cams = normalizeCameras({
      cameras: [
        { cameraId: 'front', enabled: false, priority: 90 },
        { cameraId: 'usb0', enabled: true },
      ],
    })
    expect(cams.map((c) => c.cameraId)).toEqual(['front', 'usb0'])
    expect(cams[0].priority).toBe(90)
    expect(cams[1].priority).toBe(80)
  })

  it('caps fps by priority', () => {
    expect(priorityFpsCap(20)).toBe(8)
    expect(priorityFpsCap(50)).toBe(15)
    expect(priorityFpsCap(80)).toBe(30)
    expect(priorityFpsCap(100)).toBe(60)
  })

  it('builds an MJPEG URL with the priority cap', () => {
    const url = buildMjpegUrl('https://edge:28680/', 'usb0', { fps: 60, maxWidth: 640, priority: 80 })
    expect(url).toBe('https://edge:28680/api/streams/mjpeg?camera=usb0&fps=30&maxWidth=640')
  })

  it('can bypass the priority cap', () => {
    const url = buildMjpegUrl('https://edge', 'usb0', { fps: 60, priority: 20, capByPriority: false })
    expect(url).toContain('fps=60')
  })

  it('sorts cameras by priority descending', () => {
    const sorted = sortCamerasByPriority([
      { cameraId: 'a', priority: 50 },
      { cameraId: 'b', priority: 90 },
    ])
    expect(sorted.map((c) => c.cameraId)).toEqual(['b', 'a'])
    expect(cameraPriority({ cameraId: 'x' })).toBe(80)
  })
})
