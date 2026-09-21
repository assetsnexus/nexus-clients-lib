/**
 * Retry schedule: 3 total attempts spread over ~10 seconds.
 * Delays between attempts ≈ 3.333s each (with optional jitter).
 */

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_WINDOW_MS = 10_000;

export type RetryScheduleOptions = {
  maxAttempts?: number;
  windowMs?: number;
  /** Deterministic jitter factor 0..1; omit for ±10% random. Pass 0 for tests. */
  jitterFactor?: number;
  /** Inject RNG for tests. */
  random?: () => number;
};

/**
 * Delays (ms) to wait AFTER each failed attempt before the next try.
 * Length = maxAttempts - 1. Sum ≈ windowMs when jitter is 0.
 */
export function computeRetryDelaysMs(opts: RetryScheduleOptions = {}): number[] {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = opts.windowMs ?? DEFAULT_RETRY_WINDOW_MS;
  const gaps = Math.max(0, maxAttempts - 1);
  if (gaps === 0) return [];

  const base = windowMs / gaps;
  const jitter =
    opts.jitterFactor !== undefined
      ? opts.jitterFactor
      : 0.1;
  const random = opts.random ?? Math.random;

  const delays: number[] = [];
  for (let i = 0; i < gaps; i += 1) {
    const factor = 1 + (random() * 2 - 1) * jitter;
    delays.push(Math.max(0, Math.round(base * factor)));
  }
  return delays;
}

/**
 * Sleep helper that respects AbortSignal.
 */
export function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError', code: 'TIMEOUT' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError', code: 'TIMEOUT' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
