/**
 * Resolves ordered stream endpoints + token from anx.communicate.stream-init.
 * Client retries endpoints in order on connection failure.
 */
export class StreamEndpointResolver {
  endpoints: string[] = [];
  token: string | null = null;
  lastRequestId: string | null = null;

  setFromStreamInit(streamInitResponse: Record<string, unknown> | null | undefined): void {
    const obj = streamInitResponse || {};
    const urls =
      (obj.endpoints as unknown) ||
      (obj.urls as unknown) ||
      (obj.streamEndpoints as unknown) ||
      (obj.baseUrl ? [obj.baseUrl] : []);

    this.endpoints = Array.isArray(urls) ? urls.filter(Boolean).map(String) : [];
    this.token =
      (typeof obj.token === 'string' && obj.token) ||
      (typeof obj.streamToken === 'string' && obj.streamToken) ||
      (typeof obj.accessToken === 'string' && obj.accessToken) ||
      null;
    this.lastRequestId = typeof obj.requestId === 'string' ? obj.requestId : null;
  }

  getOrderedEndpoints(): string[] {
    return [...this.endpoints];
  }

  getToken(): string | null {
    return this.token;
  }

  resolveWebSocketUrl(index = 0): string | null {
    const base = this.endpoints[index];
    if (!base) return null;
    if (!this.token) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(this.token)}`;
  }

  async connectWebSocket(handlers: {
    onOpen?: (ev: Event) => void;
    onMessage?: (ev: MessageEvent) => void;
    onError?: (ev: Event) => void;
    onClose?: (ev: CloseEvent) => void;
  } = {}): Promise<WebSocket> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.endpoints.length; i++) {
      const url = this.resolveWebSocketUrl(i);
      if (!url) continue;

      try {
        const ws = await this.openSocket(url, handlers);
        return ws;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error('No stream endpoints available');
  }

  private openSocket(
    url: string,
    handlers: {
      onOpen?: (ev: Event) => void;
      onMessage?: (ev: MessageEvent) => void;
      onError?: (ev: Event) => void;
      onClose?: (ev: CloseEvent) => void;
    },
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`WebSocket connect timeout: ${url}`));
      }, 10_000);

      ws.onopen = (ev) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        handlers.onOpen?.(ev);
        resolve(ws);
      };
      ws.onmessage = (ev) => handlers.onMessage?.(ev);
      ws.onerror = (ev) => {
        handlers.onError?.(ev);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`WebSocket error: ${url}`));
        }
      };
      ws.onclose = (ev) => handlers.onClose?.(ev);
    });
  }
}
