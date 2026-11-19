import type { SeriesPoint } from './types.js'

const UNIT_SEP = '\u001f'

/** Newest samples kept per series after the visible window is applied. */
export const MAX_POINTS_PER_SERIES = 1800

/** Parse Prometheus, legacy `\u001f`, or saved `name@component` keys. */
export function parseSeriesKey(key: string): { name: string; labels: Record<string, string> } {
  if (!key || typeof key !== 'string') return { name: key || '', labels: {} }
  if (key.includes(UNIT_SEP)) {
    const [name, comp] = key.split(UNIT_SEP)
    return { name, labels: comp ? { component: comp } : {} }
  }
  const open = key.indexOf('{')
  if (open > 0 && key.endsWith('}')) {
    const name = key.slice(0, open)
    const body = key.slice(open + 1, -1)
    const labels: Record<string, string> = {}
    const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) labels[m[1]] = unescapeLabel(m[2])
    return { name, labels }
  }
  const at = key.indexOf('@')
  if (at > 0) return { name: key.slice(0, at), labels: { component: key.slice(at + 1) } }
  return { name: key, labels: {} }
}

/** Normalize edge `\u001f` component keys to `id@component`. Prometheus keys stay as-is. */
export function normalizeSeriesKey(key: string): string {
  if (!key || typeof key !== 'string') return key
  if (key.includes(UNIT_SEP)) {
    const [base, comp] = key.split(UNIT_SEP)
    return comp ? `${base}@${comp}` : base
  }
  return key
}

export function baseMetricId(id: string): string {
  if (!id || typeof id !== 'string') return id
  return parseSeriesKey(normalizeSeriesKey(id)).name
}

export function trimPoints(points: SeriesPoint[], maxPoints = MAX_POINTS_PER_SERIES): SeriesPoint[] {
  if (!Array.isArray(points) || points.length <= maxPoints) return points
  return points.slice(points.length - maxPoints)
}

/** Drop samples older than the visible window, then cap length. */
export function trimPointsSince(
  points: SeriesPoint[],
  fromMs: number,
  maxPoints = MAX_POINTS_PER_SERIES,
): SeriesPoint[] {
  const list = Array.isArray(points) ? points : []
  if (!Number.isFinite(fromMs)) return trimPoints(list, maxPoints)
  const kept = list.filter((p) => {
    const ms = Date.parse(p && p.t)
    return Number.isFinite(ms) && ms >= fromMs
  })
  return trimPoints(kept, maxPoints)
}

/** Merge ISO-timestamped points, sort ascending, then trim to max. */
export function mergeTrimPoints(
  existing: SeriesPoint[],
  incoming: SeriesPoint[],
  maxPoints = MAX_POINTS_PER_SERIES,
): SeriesPoint[] {
  const byT = new Map<string, SeriesPoint>()
  for (const p of [...(existing || []), ...(incoming || [])]) {
    if (!p || !p.t) continue
    byT.set(p.t, p)
  }
  const merged = Array.from(byT.values()).sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
  return trimPoints(merged, maxPoints)
}

function unescapeLabel(raw: string): string {
  return String(raw)
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}
