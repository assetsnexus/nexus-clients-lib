import type { CameraEntry } from './types.js'

/** Default priority for a camera (media) stream. */
export const CAMERA_STREAM_PRIORITY = 80

/** Normalize a `GET /api/cameras` payload into camera entries. */
export function normalizeCameras(raw: unknown): CameraEntry[] {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(body.cameras) ? body.cameras : []
  return list
    .filter((cam): cam is Record<string, unknown> => !!cam && typeof cam === 'object')
    .map((cam) => {
      const id = String(cam.cameraId || cam.id || '')
      return {
        ...cam,
        cameraId: id,
        label: typeof cam.label === 'string' ? cam.label : id,
        enabled: cam.enabled !== false,
        priority: cameraPriority(cam as CameraEntry),
      } as CameraEntry
    })
    .filter((cam) => !!cam.cameraId)
}

/** Camera priority (explicit `priority`, else 80). */
export function cameraPriority(cam: CameraEntry | null | undefined): number {
  const p = Number(cam && cam.priority)
  return Number.isFinite(p) ? p : CAMERA_STREAM_PRIORITY
}

/**
 * Max fps a camera stream may request, by QoS priority (higher = higher cap).
 * Mirrors the node's server-side floor so the client never asks for more than
 * the edge will deliver.
 */
export function priorityFpsCap(priority: number): number {
  if (priority <= 30) return 8
  if (priority <= 60) return 15
  if (priority <= 85) return 30
  return 60
}

export type MjpegUrlOptions = {
  fps?: number
  maxWidth?: number
  /** Apply the priority fps cap (default true). */
  capByPriority?: boolean
  priority?: number
}

/** Build the MJPEG URL for one camera (fps capped by priority). */
export function buildMjpegUrl(
  baseUrl: string,
  cameraId: string,
  options: MjpegUrlOptions = {},
): string {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const requested = Number(options.fps) > 0 ? Number(options.fps) : 15
  const capByPriority = options.capByPriority !== false
  const priority = Number.isFinite(options.priority) ? Number(options.priority) : CAMERA_STREAM_PRIORITY
  const fps = capByPriority ? Math.min(requested, priorityFpsCap(priority)) : requested
  const params = new URLSearchParams({ camera: cameraId, fps: String(fps) })
  if (Number(options.maxWidth) > 0) params.set('maxWidth', String(options.maxWidth))
  return `${base}/api/streams/mjpeg?${params.toString()}`
}

/** Cameras sorted by priority descending (main camera first). */
export function sortCamerasByPriority(cameras: CameraEntry[]): CameraEntry[] {
  return [...cameras].sort((a, b) => cameraPriority(b) - cameraPriority(a))
}
