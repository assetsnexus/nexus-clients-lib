export type Logger = {
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
  error?: (msg: string, meta?: Record<string, unknown>) => void;
};

export const noopLogger: Logger = {};

const SECRET_KEYS = /token|secret|password|authorization|api[_-]?key|refresh/i;

export function redactForLog(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 24 && /^[A-Za-z0-9._\-+=/]+$/.test(value)) {
      return `${value.slice(0, 4)}…[redacted]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactForLog);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redactForLog(v);
    }
    return out;
  }
  return value;
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createIdempotencyKey(): string {
  return `idem_${createRequestId()}`;
}
