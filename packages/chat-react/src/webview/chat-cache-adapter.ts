/**
 * WebView `ChatCacheAdapter` backed by the native app's AsyncStorage.
 *
 * The app never stores message bodies here — only conversation-list metadata and
 * short turn previews — but previews are still user content, so the native side
 * keeps them under its app-private storage. This module is the WebView half: it
 * round-trips `chatCacheRequest` / `chatCacheResult` over the host bridge.
 *
 * Unlike the avatar byte cache (which falls back to the Cache API), the app
 * WebView has no durable key/value store of its own, so a bridge that predates
 * the channel degrades to a timeout + safe empty value — the chat still works,
 * it just refetches after a reload. Every method resolves, never throws.
 */

export type ChatCacheRequestMessage =
  | { type: 'chatCacheRequest'; requestId: string; op: 'get'; key: string }
  | { type: 'chatCacheRequest'; requestId: string; op: 'set'; key: string; value: string }
  | { type: 'chatCacheRequest'; requestId: string; op: 'delete'; key: string }
  | { type: 'chatCacheRequest'; requestId: string; op: 'keys' }
  | { type: 'chatCacheRequest'; requestId: string; op: 'clear' };

export type ChatCacheResultMessage = {
  type: 'chatCacheResult';
  requestId: string;
  ok: boolean;
  value?: string | null;
  keys?: string[];
  error?: string;
};

/** The minimal `ChatCacheAdapter` shape (kept local so chat-react stays core-free here). */
export type ChatCacheAdapter = {
  get: (key: string) => Promise<string | null> | string | null;
  set: (key: string, value: string) => Promise<void> | void;
  delete: (key: string) => Promise<void> | void;
  keys: () => Promise<string[]> | string[];
};

export type ChatCacheTransport = {
  /** Post one request to the native shell; it replies with a matching requestId. */
  send: (request: ChatCacheRequestMessage) => void;
  /** Subscribe to native replies. Returns an unsubscribe. */
  onResult: (handler: (result: ChatCacheResultMessage) => void) => () => void;
};

function nextRequestId(): string {
  return `chat-cache-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const TIMEOUT_MS = 15_000;

/**
 * Build the adapter. Responses are matched by `requestId`; a missing reply
 * (older native shell) or a timeout resolves the safe empty value.
 */
export function createWebViewChatCacheAdapter(transport: ChatCacheTransport): ChatCacheAdapter {
  const pending = new Map<
    string,
    {
      resolve: (result: ChatCacheResultMessage) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const unsubscribe = transport.onResult((result) => {
    const wait = pending.get(result.requestId);
    if (!wait) return;
    pending.delete(result.requestId);
    clearTimeout(wait.timer);
    wait.resolve(result);
  });

  const call = (request: ChatCacheRequestMessage): Promise<ChatCacheResultMessage> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!pending.has(request.requestId)) return;
        pending.delete(request.requestId);
        // A missing native channel must not hang the chat path.
        resolve({ type: 'chatCacheResult', requestId: request.requestId, ok: false });
      }, TIMEOUT_MS);
      pending.set(request.requestId, { resolve, timer });
      try {
        transport.send(request);
      } catch {
        clearTimeout(timer);
        pending.delete(request.requestId);
        resolve({ type: 'chatCacheResult', requestId: request.requestId, ok: false });
      }
    });

  const adapter: ChatCacheAdapter & { dispose: () => void } = {
    async get(key) {
      const result = await call({ type: 'chatCacheRequest', requestId: nextRequestId(), op: 'get', key });
      return result.ok && typeof result.value === 'string' ? result.value : null;
    },
    async set(key, value) {
      await call({ type: 'chatCacheRequest', requestId: nextRequestId(), op: 'set', key, value });
    },
    async delete(key) {
      await call({ type: 'chatCacheRequest', requestId: nextRequestId(), op: 'delete', key });
    },
    async keys() {
      const result = await call({ type: 'chatCacheRequest', requestId: nextRequestId(), op: 'keys' });
      return result.ok && Array.isArray(result.keys) ? result.keys : [];
    },
    dispose() {
      unsubscribe();
      for (const [, wait] of pending) clearTimeout(wait.timer);
      pending.clear();
    },
  };
  return adapter;
}
