/**
 * Region redirect contract (what region-node returns today, plus `{url}` endpoints):
 *
 * - HTTP status 307, or
 * - JSON envelope `responseCode: 307` with `errorObjects[].code === "REGION_REDIRECT"`
 *
 * Peers live on `suggestedPeers` or `responseObject.suggestedPeers`
 * (also `errorObjects[].details.suggestedPeers`). Each peer is
 * `{ endpoints: Array<string | { url: string }> }`.
 */
export type RegionRedirectParse =
  | { redirect: false }
  | { redirect: true; endpoints: string[] };

export function parseRegionRedirect(status: number, text: string): RegionRedirectParse {
  const body = parseJson(text);
  const httpRedirect = status === 307;
  const envelopeRedirect = isEnvelopeRedirect(body);
  if (!httpRedirect && !envelopeRedirect) return { redirect: false };
  return { redirect: true, endpoints: collectEndpoints(body) };
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isEnvelopeRedirect(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  if (record.responseCode !== 307) return false;
  const errors = record.errorObjects;
  if (!Array.isArray(errors)) return false;
  return errors.some((item) => {
    if (!item || typeof item !== 'object') return false;
    return (item as { code?: unknown }).code === 'REGION_REDIRECT';
  });
}

function collectEndpoints(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const record = body as Record<string, unknown>;
  const found: string[] = [];
  pushPeers(found, record.suggestedPeers);
  const responseObject = record.responseObject;
  if (responseObject && typeof responseObject === 'object') {
    pushPeers(found, (responseObject as Record<string, unknown>).suggestedPeers);
  }
  const errors = record.errorObjects;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (!item || typeof item !== 'object') continue;
      const details = (item as { details?: unknown }).details;
      if (details && typeof details === 'object') {
        pushPeers(found, (details as Record<string, unknown>).suggestedPeers);
      }
    }
  }
  return dedupe(found);
}

function pushPeers(out: string[], peers: unknown): void {
  if (!Array.isArray(peers)) return;
  for (const peer of peers) {
    if (!peer || typeof peer !== 'object') continue;
    const endpoints = (peer as { endpoints?: unknown }).endpoints;
    if (!Array.isArray(endpoints)) continue;
    for (const endpoint of endpoints) {
      if (typeof endpoint === 'string' && endpoint.trim()) {
        out.push(endpoint.trim());
      } else if (endpoint && typeof endpoint === 'object') {
        const url = (endpoint as { url?: unknown }).url;
        if (typeof url === 'string' && url.trim()) out.push(url.trim());
      }
    }
  }
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
