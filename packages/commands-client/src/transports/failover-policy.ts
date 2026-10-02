export type TransportFailureKind = 'dns' | 'refused' | 'tls' | 'reset' | 'timeout' | 'other';

export type RouteAttemptClass = {
  isRead: boolean;
  idempotent: boolean;
};

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const REFUSED_CODES = new Set(['ECONNREFUSED', 'ERR_CONNECTION_REFUSED']);
const RESET_CODES = new Set(['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']);
const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNABORTED',
  'ABORTERROR',
  'TIMEOUT',
  'TIMEOUTERROR',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);
const TLS_CODES = new Set([
  'EPROTO',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_TLS_HANDSHAKE_TIMEOUT',
]);

type ErrorLink = {
  code?: unknown;
  name?: unknown;
  message?: unknown;
  cause?: unknown;
};

function walk(err: unknown): ErrorLink[] {
  const out: ErrorLink[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    out.push(current as ErrorLink);
    current = (current as ErrorLink).cause;
  }
  if (out.length === 0 && err instanceof Error) out.push(err);
  return out;
}

function asCode(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase() : '';
}

/**
 * Classify a thrown fetch/undici error. HTTP responses are not passed here.
 * Connection-setup failures (DNS, refused, TLS) are distinct from reset and
 * timeout, which may mean the write already reached a region.
 */
export function classifyTransportFailure(err: unknown): TransportFailureKind {
  const chain = walk(err);
  const codes = chain.map((link) => asCode(link.code)).filter(Boolean);
  const names = chain.map((link) => asCode(link.name)).filter(Boolean);
  const message = chain
    .map((link) => (typeof link.message === 'string' ? link.message : ''))
    .join(' ');

  const tokens = new Set([...codes, ...names]);
  if ([...tokens].some((token) => TIMEOUT_CODES.has(token)) || /timeout|aborted|abort/i.test(message)) {
    return 'timeout';
  }
  if ([...tokens].some((token) => DNS_CODES.has(token)) || /ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(message)) {
    return 'dns';
  }
  if ([...tokens].some((token) => REFUSED_CODES.has(token)) || /ECONNREFUSED|connection refused/i.test(message)) {
    return 'refused';
  }
  if (
    [...tokens].some((token) => TLS_CODES.has(token) || token.startsWith('ERR_TLS') || token.startsWith('CERT_')) ||
    /certificate|UNABLE_TO_VERIFY|tls handshake|ssl/i.test(message)
  ) {
    return 'tls';
  }
  if ([...tokens].some((token) => RESET_CODES.has(token)) || /ECONNRESET|socket hang up/i.test(message)) {
    return 'reset';
  }
  return 'other';
}

/**
 * Reads always fail over on connection setup, reset, and timeout.
 * Writes fail over on DNS / refused / TLS (request was not sent).
 * Writes fail over on timeout or reset only when the call is idempotent.
 */
export function shouldFailoverFailure(kind: TransportFailureKind, attempt: RouteAttemptClass): boolean {
  if (kind === 'dns' || kind === 'refused' || kind === 'tls') return true;
  if (kind === 'reset' || kind === 'timeout') return attempt.isRead || attempt.idempotent;
  return false;
}

/** Gateway failures worth trying on another origin. 4xx never fails over. */
export function shouldFailoverHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}
