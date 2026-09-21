/**
 * Strict transport-disconnect classifier for region-node HTTP commands.
 *
 * A disconnect means the region gateway never returned an HTTP response
 * (connection refused / DNS / offline). Long command timeouts and HTTP
 * 4xx/5xx must NOT be treated as "region down".
 */

export const SHORT_TIMEOUT_DISCONNECT_MS = 8_000;

export type TransportDisconnectInput = {
  /** Axios/fetch-style error (or NexusError). */
  error: unknown;
  /**
   * Request timeout used for this call (ms). When omitted, abort/timeout
   * is never treated as disconnect (long AI commands use 300s).
   * When ≤ SHORT_TIMEOUT_DISCONNECT_MS, abort/timeout may count.
   */
  requestTimeoutMs?: number;
  /** Optional navigator.onLine override (tests / non-browser). */
  online?: boolean;
};

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ERR_NETWORK',
  'ERR_CONNECTION_REFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
]);

const CONNECTION_MESSAGE_RE =
  /failed to fetch|network error|networkrequestfailed|load failed|connection refused|enotfound|econnrefused/i;

function hasHttpResponse(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  if (e.response != null) return true;
  // fetch Response-like
  if (typeof e.status === 'number' && (e.status as number) > 0) return true;
  return false;
}

function readCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const e = error as Record<string, unknown>;
  return String(e.code || e.name || '');
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  if (!error || typeof error !== 'object') return String(error || '');
  const e = error as Record<string, unknown>;
  return String(e.message || '');
}

function isAbortOrTimeout(code: string, message: string): boolean {
  if (code === 'ECONNABORTED' || code === 'TIMEOUT' || code === 'AbortError') return true;
  if (/timeout|aborted|abort/i.test(message)) return true;
  return false;
}

/**
 * Returns true when the failure indicates the region gateway is unreachable
 * (no HTTP response, connection-level).
 */
export function isTransportDisconnect(input: TransportDisconnectInput): boolean {
  const { error, requestTimeoutMs } = input;
  if (error == null) return false;

  if (input.online === false) return true;
  if (
    typeof input.online === 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.onLine === 'boolean' &&
    navigator.onLine === false
  ) {
    return true;
  }

  if (hasHttpResponse(error)) return false;

  const code = readCode(error);
  const message = readMessage(error);

  if (CONNECTION_CODES.has(code)) return true;
  if (CONNECTION_MESSAGE_RE.test(message)) return true;

  // NexusError TRANSPORT_ERROR without HTTP response
  if (
    error &&
    typeof error === 'object' &&
    (error as { code?: string }).code === 'TRANSPORT_ERROR'
  ) {
    // Circuit-breaker open is not a fresh disconnect probe failure path;
    // still treat as unreachable for queue purposes.
    return true;
  }

  if (isAbortOrTimeout(code, message)) {
    const t = requestTimeoutMs;
    if (typeof t === 'number' && t > 0 && t <= SHORT_TIMEOUT_DISCONNECT_MS) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Convenience for axios-style errors where timeout lives on config.
 */
export function isTransportDisconnectFromAxios(
  error: unknown,
  opts?: { online?: boolean },
): boolean {
  let requestTimeoutMs: number | undefined;
  if (error && typeof error === 'object') {
    const cfg = (error as { config?: { timeout?: number } }).config;
    if (cfg && typeof cfg.timeout === 'number') requestTimeoutMs = cfg.timeout;
  }
  return isTransportDisconnect({
    error,
    requestTimeoutMs,
    online: opts?.online,
  });
}
