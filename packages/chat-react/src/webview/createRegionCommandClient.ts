import type { CommandClient } from '@nexus/chat-core';

export type RegionIdentity = {
  userId?: string | null;
  orgId?: string | null;
  role?: string | null;
  deviceId?: string | null;
  token: string;
};

export type RegionCommandClientOptions = {
  apiBaseUrl: string;
  identity: RegionIdentity;
  fetchFn?: typeof fetch;
};

/**
 * Browser/WebView CommandClient that posts the ANX command envelope to region-node.
 * Token is supplied by the native host bridge — never from the page URL.
 */
export function createRegionCommandClient(
  opts: RegionCommandClientOptions,
): CommandClient & { updateAuth: (next: { apiBaseUrl?: string; identity?: RegionIdentity }) => void } {
  const fetchFn = opts.fetchFn || fetch;
  let identity = { ...opts.identity };
  let apiBaseUrl = opts.apiBaseUrl.replace(/\/$/, '');

  return {
    async send(command: string, payload?: Record<string, unknown>) {
      const requestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const body = {
        command,
        requestId,
        payload: payload || {},
        identity: {
          userId: identity.userId || undefined,
          orgId: identity.orgId || undefined,
          role: identity.role || undefined,
          deviceId: identity.deviceId || undefined,
          token: identity.token,
        },
        responseExpected: true,
        timestamp: new Date().toISOString(),
      };
      const res = await fetchFn(`${apiBaseUrl}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity.token}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const responseCode = Number(json.responseCode ?? res.status);
      const data = json.responseObject ?? json.data ?? json;
      return {
        ok: responseCode >= 200 && responseCode < 300,
        data,
        responseCode,
        responseObject: data,
        message: typeof json.message === 'string' ? json.message : undefined,
        authorizationRequired: Boolean(json.authorizationRequired),
        authRequestId: json.authRequestId,
      };
    },
    updateAuth(next: { apiBaseUrl?: string; identity?: RegionIdentity }) {
      if (next.apiBaseUrl) apiBaseUrl = next.apiBaseUrl.replace(/\/$/, '');
      if (next.identity) identity = { ...identity, ...next.identity };
    },
  };
}
