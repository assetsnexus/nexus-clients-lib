export type RegionRouteKind = 'primary' | 'alternative' | 'internal_lan';

export type RegionRoute = {
  url: string;
  /** Lower numbers are preferred. */
  priority: number;
  kind?: RegionRouteKind;
};

export type RegionRoutes = {
  slug: string;
  routes: RegionRoute[];
  home?: boolean;
  issuer?: string;
  publicKeyId?: string;
};

export type ParseRegionRoutesOptions = {
  /**
   * Allow non-localhost `http:` URLs. `http://localhost`, `127.0.0.1`, and `::1`
   * are accepted even when this is false.
   */
  allowHttp?: boolean;
};

const MAX_ROUTES = 8;
const ROUTE_KINDS = new Set<RegionRouteKind>(['primary', 'alternative', 'internal_lan']);

/**
 * Weight passed to {@link scoreRoute}. Lower route priority produces a higher
 * weight so {@link resolveRoutes} (score descending) prefers it.
 */
export function kindWeightFromPriority(priority: number): number {
  if (!Number.isFinite(priority)) return 1;
  return Math.max(1, 1000 - priority);
}

/**
 * Accepts an OAuth token body (`anx_region`) or a login response (`region`).
 * Returns undefined when the field is missing or the shape is invalid.
 * Does not throw. Routes are sorted by priority ascending, de-duplicated by
 * URL, and capped at 8.
 */
export function parseRegionRoutes(
  body: unknown,
  options?: ParseRegionRoutesOptions,
): RegionRoutes | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const raw = record.anx_region ?? record.region;
  if (raw == null) return undefined;
  return parseRegionDocument(raw, options?.allowHttp === true);
}

function parseRegionDocument(raw: unknown, allowHttp: boolean): RegionRoutes | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const region = raw as Record<string, unknown>;
  if (typeof region.slug !== 'string' || region.slug.trim() === '') return undefined;
  if (!Array.isArray(region.routes)) return undefined;

  const seen = new Set<string>();
  const routes: RegionRoute[] = [];
  for (const item of region.routes) {
    const parsed = parseRoute(item, allowHttp);
    if (!parsed) return undefined;
    if (seen.has(parsed.url)) continue;
    seen.add(parsed.url);
    routes.push(parsed);
  }
  if (routes.length === 0) return undefined;

  routes.sort((a, b) => a.priority - b.priority);
  const capped = routes.slice(0, MAX_ROUTES);

  const result: RegionRoutes = { slug: region.slug, routes: capped };
  if (typeof region.home === 'boolean') result.home = region.home;
  if (typeof region.issuer === 'string' && region.issuer.length > 0) result.issuer = region.issuer;
  if (typeof region.publicKeyId === 'string' && region.publicKeyId.length > 0) {
    result.publicKeyId = region.publicKeyId;
  }
  return result;
}

function parseRoute(item: unknown, allowHttp: boolean): RegionRoute | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const route = item as Record<string, unknown>;
  if (typeof route.url !== 'string') return undefined;
  if (typeof route.priority !== 'number' || !Number.isFinite(route.priority)) return undefined;
  const url = canonicalRouteUrl(route.url, allowHttp);
  if (!url) return undefined;

  let kind: RegionRouteKind | undefined;
  if (route.kind != null) {
    if (typeof route.kind !== 'string' || !ROUTE_KINDS.has(route.kind as RegionRouteKind)) {
      return undefined;
    }
    kind = route.kind as RegionRouteKind;
  }

  return kind ? { url, priority: route.priority, kind } : { url, priority: route.priority };
}

/** https always; http only for localhost or when `allowHttp` is set. */
export function canonicalRouteUrl(raw: string, allowHttp: boolean): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol === 'https:') {
    // accepted
  } else if (url.protocol === 'http:') {
    if (!allowHttp && !isLocalHostname(url.hostname)) return undefined;
  } else {
    return undefined;
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}${url.search}`;
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
