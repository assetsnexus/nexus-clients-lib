import type { ArrivalDecision } from './types.js'

export type ArrivalGateOptions = {
  /** Max recent seqs remembered (default 512). */
  windowSize?: number
  /** Clock injection for tests. */
  now?: () => number
}

export type ArrivalGateInput = {
  routeId: string
  seq?: number | string
  ts?: number | string
  /** When false, every frame is accepted (single-route mode). */
  forceParallel?: boolean
}

export type ArrivalGate = {
  reset(): void
  consider(input: ArrivalGateInput): ArrivalDecision
}

/**
 * First copy of a frame wins. Frames that share `seq` are the same broadcast;
 * a later copy is a duplicate and still counts as load on its route. Without
 * `seq`, fall back to the frame timestamp so older edges keep working.
 * Single-route mode accepts everything.
 */
export function createArrivalGate(options: ArrivalGateOptions = {}): ArrivalGate {
  const windowSize = Math.max(1, options.windowSize ?? 512)
  const now = options.now ?? (() => Date.now())
  const recent: Array<{ seq: number; routeId: string; at: number }> = []
  let watermark: number | null = null
  let winner: string | null = null

  return {
    reset() {
      recent.length = 0
      watermark = null
      winner = null
    },
    consider({ routeId, seq, ts, forceParallel }) {
      if (!forceParallel) return { accepted: true, reason: 'single', seq: toNumber(seq) }
      const n = toNumber(seq)
      if (n != null) {
        const prev = recent.find((row) => row.seq === n)
        if (prev) {
          return {
            accepted: false,
            reason: 'duplicate',
            seq: n,
            lagMs: Math.max(0, now() - prev.at),
          }
        }
        recent.push({ seq: n, routeId, at: now() })
        if (recent.length > windowSize) recent.splice(0, recent.length - windowSize)
        return { accepted: true, reason: 'first', seq: n }
      }
      const ms = toMs(ts)
      if (ms == null) return { accepted: true, reason: 'untimed' }
      if (watermark != null && ms < watermark) return { accepted: false, reason: 'delayed' }
      if (watermark != null && ms === watermark && winner && winner !== routeId) {
        return { accepted: false, reason: 'duplicate' }
      }
      watermark = ms
      winner = routeId
      return { accepted: true, reason: 'first' }
    },
  }
}

function toNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function toMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}
