/**
 * Shared route resolver: normalize candidate kinds, apply default weights, score
 * and order routes. Used by portal / app / edge once candidates are known.
 * Framework-free; pairs with RouteMonitor for live QoS.
 */

import { defaultKindWeight, scoreRoute, type RouteKind } from './route-score.js';

export interface RouteCandidateInput {
  id: string;
  kind?: RouteKind;
  /** Override weight; defaults from `defaultKindWeight(kind)`. */
  kindWeight?: number;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  /** Optional measured QoS; missing values score as unknown (rtt 0, loss 0). */
  rttMs?: number;
  jitterMs?: number;
  lossRatio?: number;
  failed?: boolean;
  /** When true, BLE is excluded (media paths). Default false. */
  media?: boolean;
}

export interface ResolvedRoute {
  id: string;
  kind: RouteKind;
  kindWeight: number;
  url?: string;
  host?: string;
  port?: number;
  score: number;
  reachable: boolean;
}

/** Normalize asset-node / portal candidate shapes into resolver input. */
export function normalizeCandidate(raw: {
  routeId?: string;
  route_id?: string;
  id?: string;
  routeType?: string;
  route_type?: string;
  kind?: string;
  priorityWeight?: number;
  priority_weight?: number;
  kindWeight?: number;
  url?: string | null;
  host?: string | null;
  port?: number | null;
}): RouteCandidateInput | null {
  const id = raw.routeId || raw.route_id || raw.id;
  if (!id) return null;
  const kind = (raw.routeType || raw.route_type || raw.kind || 'p2p_direct') as RouteKind;
  const kindWeight =
    raw.kindWeight ?? raw.priorityWeight ?? raw.priority_weight ?? defaultKindWeight(kind);
  return {
    id,
    kind,
    kindWeight,
    url: raw.url ?? undefined,
    host: raw.host ?? undefined,
    port: raw.port ?? undefined,
  };
}

/**
 * Score and sort candidates (best first). BLE is dropped when `media` is set
 * on the candidate or when `opts.forMedia` is true.
 */
export function resolveRoutes(
  candidates: RouteCandidateInput[],
  opts?: { forMedia?: boolean },
): ResolvedRoute[] {
  const forMedia = !!opts?.forMedia;
  const out: ResolvedRoute[] = [];
  for (const c of candidates) {
    const kind = (c.kind || 'p2p_direct') as RouteKind;
    if (forMedia || c.media) {
      if (kind === 'ble' || String(kind).toLowerCase() === 'ble') continue;
    }
    const kindWeight = c.kindWeight ?? defaultKindWeight(kind);
    const failed = !!c.failed;
    const score = scoreRoute({
      rttMs: c.rttMs ?? 0,
      jitterMs: c.jitterMs ?? 0,
      lossRatio: c.lossRatio ?? 0,
      kindWeight,
      failed,
    });
    out.push({
      id: c.id,
      kind,
      kindWeight,
      url: c.url ?? undefined,
      host: c.host ?? undefined,
      port: c.port ?? undefined,
      score,
      reachable: !failed,
    });
  }
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return out;
}

/** Best non-failed route, or undefined. */
export function pickBestRoute(
  candidates: RouteCandidateInput[],
  opts?: { forMedia?: boolean },
): ResolvedRoute | undefined {
  return resolveRoutes(candidates, opts)[0];
}

/**
 * App / edge browse hook: turn an mDNS-discovered `_anx._tcp` endpoint into a
 * `lan_mdns` route candidate for {@link resolveRoutes}. Does not perform the
 * native browse itself (platform-specific).
 */
export function mdnsEndpointToLanCandidate(input: {
  /** Stable id; defaults to `lan_mdns:<host>:<port>`. */
  id?: string;
  host: string;
  port: number;
  /** Prefer https when the asset advertises TLS. Default true. */
  https?: boolean;
  /** Optional asset id from TXT (`assetId`). */
  assetId?: string;
  path?: string;
}): RouteCandidateInput {
  const https = input.https !== false;
  const scheme = https ? 'https' : 'http';
  const path = input.path?.startsWith('/') ? input.path : input.path ? `/${input.path}` : '';
  const url = `${scheme}://${input.host}:${input.port}${path}`;
  const id = input.id || `lan_mdns:${input.host}:${input.port}`;
  return {
    id,
    kind: 'lan_mdns',
    kindWeight: defaultKindWeight('lan_mdns'),
    url,
    host: input.assetId || input.host,
    port: input.port,
  };
}

/** Merge mDNS discoveries into an existing candidate list (dedupe by id/url). */
export function mergeLanMdnsCandidates(
  existing: RouteCandidateInput[],
  discovered: Array<Parameters<typeof mdnsEndpointToLanCandidate>[0]>,
): RouteCandidateInput[] {
  const out = [...existing];
  const seen = new Set(
    existing.flatMap((c) => [c.id, c.url].filter(Boolean) as string[]),
  );
  for (const d of discovered) {
    const c = mdnsEndpointToLanCandidate(d);
    if (seen.has(c.id) || (c.url && seen.has(c.url))) continue;
    seen.add(c.id);
    if (c.url) seen.add(c.url);
    out.push(c);
  }
  return out;
}
