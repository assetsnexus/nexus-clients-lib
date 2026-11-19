import { MAX_POINTS_PER_SERIES, mergeTrimPoints, normalizeSeriesKey, trimPointsSince } from './series.js'
import type { MetricsFrame, SeriesPoint } from './types.js'

export type MetricsStoreOptions = {
  /** Newest samples kept per series (default 1800). */
  maxPoints?: number
  /** Auto-flush cadence in ms (default 250). 0 disables the timer. */
  flushMs?: number
  /** Only buffer series that pass this filter (default: all). */
  acceptSeries?: (key: string) => boolean
  /** Clock injection for tests. */
  now?: () => number
}

type PendingPoint = { key: string; t: string; v: number }

export type MetricsStore = {
  /** Buffer a frame's samples/metrics; applied on the next flush. */
  ingestFrame(frame: MetricsFrame): void
  /** Buffer one point; applied on the next flush. */
  pushPoint(key: string, t: string, v: number): void
  /** Apply buffered points to the series and notify subscribers. */
  flush(): void
  /** Drop samples older than `fromMs` (visible-window trim). */
  setRange(fromMs: number): void
  getSeries(key: string): SeriesPoint[]
  getLatest(key: string): number | undefined
  getLatestTs(key: string): string | undefined
  /** All latest values as a plain object. */
  latestMap(): Record<string, number>
  /** Keys that have a latest value. */
  latestKeys(): string[]
  getKeys(): string[]
  clear(): void
  start(): void
  stop(): void
  subscribe(listener: (changedKeys: string[]) => void): () => void
}

/**
 * Framework-free live-metrics store.
 *
 * Frames are buffered and applied at a fixed cadence so a high-rate stream does
 * not re-render the UI per message. Parallel-route fan-in is handled upstream by
 * the arrival gate; this store only merges accepted points (dedup by timestamp).
 */
export function createMetricsStore(options: MetricsStoreOptions = {}): MetricsStore {
  const maxPoints = Math.max(1, options.maxPoints ?? MAX_POINTS_PER_SERIES)
  const flushMs = options.flushMs ?? 250
  const acceptSeries = options.acceptSeries ?? (() => true)
  const now = options.now ?? (() => Date.now())

  const series = new Map<string, SeriesPoint[]>()
  const latest = new Map<string, number>()
  const latestTs = new Map<string, string>()
  let pending: PendingPoint[] = []
  let fromMs = Number.NEGATIVE_INFINITY
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(changedKeys: string[]) => void>()

  function push(key: string, t: string, v: number): void {
    if (!Number.isFinite(v)) return
    const k = normalizeSeriesKey(key)
    if (!acceptSeries(k) && !acceptSeries(key)) return
    latest.set(k, v)
    latestTs.set(k, t)
    pending.push({ key: k, t, v })
  }

  function ingestFrame(frame: MetricsFrame): void {
    if (!frame || typeof frame !== 'object') return
    const ts = frame.ts != null ? frame.ts : frame.tMs != null ? frame.tMs : now()
    const iso = typeof ts === 'number' ? new Date(ts).toISOString() : String(ts)
    const samples = frame.samples
    if (samples && typeof samples === 'object') {
      for (const [key, pts] of Object.entries(samples)) {
        if (!Array.isArray(pts)) continue
        for (const pair of pts) {
          if (!Array.isArray(pair) || pair.length < 2) continue
          const ms = Number(pair[0])
          const v = Number(pair[1])
          if (!Number.isFinite(ms) || !Number.isFinite(v)) continue
          push(key, new Date(ms).toISOString(), v)
        }
      }
    }
    const metrics = frame.metrics
    if (metrics && typeof metrics === 'object') {
      for (const [key, raw] of Object.entries(metrics)) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) {
          const row = raw as { value: unknown; component?: unknown }
          const seriesKey = row.component ? `${key}@${row.component}` : key
          push(seriesKey, iso, Number(row.value))
        } else {
          push(key, iso, Number(raw))
        }
      }
    }
    const values = frame.values
    if (values && typeof values === 'object') {
      for (const [key, v] of Object.entries(values)) push(key, iso, Number(v))
    }
  }

  function flush(): void {
    if (!pending.length) return
    const points = pending
    pending = []
    const byKey = new Map<string, SeriesPoint[]>()
    for (const p of points) {
      let list = byKey.get(p.key)
      if (!list) {
        list = []
        byKey.set(p.key, list)
      }
      list.push({ t: p.t, v: p.v })
    }
    const changed: string[] = []
    for (const [key, incoming] of byKey) {
      const existing = series.get(key) || []
      const merged = trimPointsSince(mergeTrimPoints(existing, incoming, maxPoints), fromMs, maxPoints)
      series.set(key, merged)
      changed.push(key)
    }
    if (changed.length) {
      for (const listener of listeners) listener(changed)
    }
  }

  function setRange(nextFromMs: number): void {
    fromMs = Number.isFinite(nextFromMs) ? nextFromMs : Number.NEGATIVE_INFINITY
    for (const [key, points] of series) {
      const trimmed = trimPointsSince(points, fromMs, maxPoints)
      if (trimmed.length) series.set(key, trimmed)
      else series.delete(key)
    }
  }

  function start(): void {
    if (timer || flushMs <= 0) return
    timer = setInterval(flush, flushMs)
  }

  function stop(): void {
    if (timer) clearInterval(timer)
    timer = null
  }

  return {
    ingestFrame,
    pushPoint: push,
    flush,
    setRange,
    getSeries: (key) => series.get(normalizeSeriesKey(key)) || [],
    getLatest: (key) => latest.get(normalizeSeriesKey(key)),
    getLatestTs: (key) => latestTs.get(normalizeSeriesKey(key)),
    latestMap: () => Object.fromEntries(latest),
    latestKeys: () => Array.from(latest.keys()),
    getKeys: () => Array.from(series.keys()),
    clear() {
      series.clear()
      latest.clear()
      latestTs.clear()
      pending = []
    },
    start,
    stop,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
