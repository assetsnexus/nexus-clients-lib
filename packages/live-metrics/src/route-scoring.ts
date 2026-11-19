import type { RouteCandidate } from './types.js'

export const DEGRADED_RTT_MS = 150
export const DEGRADED_LOSS_PCT = 2

export type RouteModel = 'region_proxy' | 'p2p' | 'other'

/** Coarse connection model for a route (p2p vs region proxy). */
export function routeModel(route: RouteCandidate | null | undefined): RouteModel {
  if (!route) return 'other'
  if (route.model === 'region_proxy' || route.model === 'p2p') return route.model as RouteModel
  const blob = `${route.routeType || ''} ${route.kind || ''} ${route.id || ''} ${route.name || ''}`.toLowerCase()
  if (/registry|region|relay|proxy|twin/.test(blob)) return 'region_proxy'
  if (/p2p|edge|intranet|direct|stun|runtime|turn/.test(blob)) return 'p2p'
  return 'other'
}

export type RouteQosState = 'active' | 'degraded' | 'offline' | 'standby'

/** Active (in use) is green, degraded is yellow, offline is gray. */
export function routeQosState(route: RouteCandidate | null | undefined): RouteQosState {
  if (!route || route.reachable === false || route.role === 'down') return 'offline'
  const used = !!(
    route.qosActive ||
    route.isCurrent ||
    route.role === 'primary' ||
    route.role === 'redundant'
  )
  if (used && !route.qosDegraded) return 'active'
  const latency = Number(route.latency)
  const slow = Number.isFinite(latency) && latency >= DEGRADED_RTT_MS
  const lossy = route.packetLoss != null && Number(route.packetLoss) >= DEGRADED_LOSS_PCT
  if (route.qosDegraded || ((slow || lossy) && !used)) return 'degraded'
  if (used) return 'active'
  return 'standby'
}

/**
 * HTTP(S) route the metrics client can open. STUN/TURN and the dummy
 * localhost:80 registry placeholder are not sockets.
 */
export function metricsRouteKind(candidate: RouteCandidate | null | undefined): 'region_proxy' | 'p2p' | null {
  const url = candidate && typeof candidate.url === 'string' ? candidate.url.trim() : ''
  if (!url) return null
  if (/^(stun|stuns|turn|turns):/i.test(url)) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  const host = parsed.hostname
  if ((host === 'localhost' || host === '127.0.0.1') && (port === '80' || port === '443')) return null
  const type = String(
    (candidate && (candidate.routeType || candidate.route_type || candidate.kind)) || '',
  ).toLowerCase()
  if (type === 'ble') return null
  if (type === 'registry_relay' || type === 'registry' || type === 'region_proxy') return 'region_proxy'
  if (
    type === 'p2p_direct' ||
    type === 'intranet' ||
    type === 'edge' ||
    type === 'p2p' ||
    type === 'wifi_direct' ||
    type === 'lan_mdns' ||
    type === 'cluster_peer_relay'
  ) {
    return 'p2p'
  }
  return null
}

/** Lowest reachable latency per connection model. Missing model stays null. */
export function bestLatencyByModel(
  routes: RouteCandidate[],
): { region_proxy: number | null; p2p: number | null } {
  const out: { region_proxy: number | null; p2p: number | null } = { region_proxy: null, p2p: null }
  for (const route of routes || []) {
    if (!route || route.reachable === false) continue
    const model = routeModel(route)
    if (model !== 'region_proxy' && model !== 'p2p') continue
    const ms = Number(route.latency)
    if (!Number.isFinite(ms) || ms >= 9999) continue
    if (out[model] == null || ms < out[model]!) out[model] = ms
  }
  return out
}

/**
 * Pick the primary metrics route: reachable, socket-capable, p2p preferred over
 * region proxy, then lowest latency. Returns null when nothing is usable.
 */
export function pickPrimaryRoute(routes: RouteCandidate[]): RouteCandidate | null {
  const usable = (routes || []).filter(
    (r) => r && r.reachable !== false && !r.fanUnsupported && metricsRouteKind(r) != null,
  )
  if (!usable.length) return null
  const score = (r: RouteCandidate): number => {
    const kind = metricsRouteKind(r)
    const kindWeight = kind === 'p2p' ? 0 : 1
    const latency = Number(r.latency)
    return kindWeight * 1_000_000 + (Number.isFinite(latency) ? latency : 999_999)
  }
  return usable.slice().sort((a, b) => score(a) - score(b))[0]
}
