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
      const json = nativeBridgeAvailable()
        ? await postCommandViaNative(body)
        : await postCommandViaFetch(fetchFn, apiBaseUrl, identity.token, body);
      const responseCode = Number(json.responseCode ?? json.status ?? 0);
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

type NativeHost = Window & {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
};

function nativeBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && typeof (window as NativeHost).ReactNativeWebView?.postMessage === 'function';
}

async function postCommandViaFetch(
  fetchFn: typeof fetch,
  apiBaseUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetchFn(`${apiBaseUrl}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (json.responseCode == null) json.responseCode = res.status;
  return json;
}

function postCommandViaNative(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const requestId = String(body.requestId || '');
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Chat command timed out'));
    }, 20000);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; requestId?: string; error?: string; json?: Record<string, unknown> } | null;
      if (!data || data.type !== 'commandResult' || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (data.error) reject(new Error(data.error));
      else resolve(data.json || {});
    };
    window.addEventListener('message', onMessage);
    (window as NativeHost).ReactNativeWebView?.postMessage(
      JSON.stringify({
        type: 'regionCommand',
        requestId,
        command: body.command,
        payload: body.payload,
        identity: body.identity,
      }),
    );
  });
}
