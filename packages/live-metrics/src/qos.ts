import type { QosProfile } from './types.js'

export type QosTier = { width: number; height: number; fps: number }

export const QOS_STEPS: ReadonlyArray<QosTier> = Object.freeze([
  Object.freeze({ width: 1280, height: 720, fps: 20 }),
  Object.freeze({ width: 854, height: 480, fps: 12 }),
  Object.freeze({ width: 640, height: 360, fps: 8 }),
])

export const QOS_FPS_LOW = 24
export const QOS_FPS_LOW_MS = 1000
export const QOS_RTT_HIGH_MS = 150
export const QOS_RTT_HIGH_FOR_MS = 1000
export const QOS_RECOVER_FPS = 30
export const QOS_RECOVER_RTT_MS = 100
export const QOS_RECOVER_FOR_MS = 3000

/** Default priority for a stream that does not declare one. */
export const QOS_DEFAULT_PRIORITY = 50
/** Minimum spacing between coordinated degrade/recover steps. */
export const QOS_COORDINATE_COOLDOWN_MS = 1000

export type QosSample = { fps?: number; lowForMs?: number }

export type QosController = {
  streamId: string
  priority: number
  readonly step: number
  readonly maxStep: number
  notePing(msg: { type?: string; streamId?: string; rtt?: number; t?: number }, now: number): void
  degrade(reason?: string): QosProfile | null
  recover(reason?: string): QosProfile | null
  readonly rtt: number | null
  readonly latest: QosProfile | null
}

export type QosControllerOptions = {
  streamId: string
  transport?: ((profile: QosProfile) => void) | null
  priority?: number
}

export function rttFromPing(
  msg: { type?: string; rtt?: number; t?: number } | null | undefined,
  now: number,
): number | null {
  if (!msg || msg.type !== 'qos.ping') return null
  if (Number.isFinite(msg.rtt)) return msg.rtt as number
  if (Number.isFinite(msg.t) && Number.isFinite(now)) return Math.max(0, now - (msg.t as number))
  return null
}

export function createQosController(options: QosControllerOptions): QosController {
  const streamId = String(options.streamId || '')
  const transport = typeof options.transport === 'function' ? options.transport : null
  const priority = Number.isFinite(options.priority) ? Number(options.priority) : QOS_DEFAULT_PRIORITY
  let step = 0
  let rtt: number | null = null
  let latest: QosProfile | null = null

  const emit = (reason: string): QosProfile => {
    const tier = QOS_STEPS[step]
    const profile: QosProfile = {
      type: 'qos.profile',
      streamId,
      fps: tier.fps,
      width: tier.width,
      height: tier.height,
      reason,
    }
    if (transport) transport(profile)
    latest = profile
    return profile
  }

  return {
    streamId,
    priority,
    get step() {
      return step
    },
    get maxStep() {
      return QOS_STEPS.length - 1
    },
    notePing(msg, now) {
      const next = rttFromPing(msg, now)
      if (next == null || (msg.streamId && String(msg.streamId) !== streamId)) return
      rtt = next
    },
    degrade(reason = 'fps') {
      if (step >= QOS_STEPS.length - 1) return null
      step += 1
      return emit(reason)
    },
    recover(reason = 'fps') {
      if (step <= 0) return null
      step -= 1
      return emit(reason)
    },
    get rtt() {
      return rtt
    },
    get latest() {
      return latest
    },
  }
}

export type QosCoordinateState = { lastChangeAt?: number }

/**
 * Priority-aware allocation: under pressure degrade the lowest-priority stream
 * that can still drop a tier; on recovery raise the highest-priority stream that
 * can still climb. The main camera (highest priority) is affected last.
 */
export function coordinateQos(
  controllers: Iterable<QosController>,
  sample: QosSample,
  now: number,
  state: QosCoordinateState = {},
): QosCoordinateState {
  const list = [...controllers]
  if (!list.length) return state
  const lowForMs = sample && Number(sample.lowForMs) > 0 ? Number(sample.lowForMs) : 0
  const fps = sample && Number.isFinite(sample.fps) ? (sample.fps as number) : 60
  const low = lowForMs >= QOS_FPS_LOW_MS
  const headroom = fps >= QOS_RECOVER_FPS
  if (!low && !headroom) return state
  if (now - (state.lastChangeAt || 0) < QOS_COORDINATE_COOLDOWN_MS) return state
  if (low) {
    const target = list
      .filter((c) => c.step < c.maxStep)
      .sort((a, b) => a.priority - b.priority)[0]
    if (target) {
      target.degrade('fps')
      state.lastChangeAt = now
    }
  } else {
    const target = list
      .filter((c) => c.step > 0)
      .sort((a, b) => b.priority - a.priority)[0]
    if (target) {
      target.recover('fps')
      state.lastChangeAt = now
    }
  }
  return state
}
