/**
 * Command connectivity controller: retry queue + degraded/down state machine.
 *
 * Framework-free. Portal/app inject transport + health probe and subscribe
 * to snapshots for overlay / taskbar UX.
 */

import { isLikelyReadCommand } from '../types.js';
import type { Logger } from '../utils.js';
import { noopLogger } from '../utils.js';
import { isTransportDisconnect } from './is-transport-disconnect.js';
import {
  computeRetryDelaysMs,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_WINDOW_MS,
  sleepMs,
} from './retry-schedule.js';

export type ConnectivityState = 'ok' | 'degraded' | 'down';

export type ConnectivitySnapshot = {
  state: ConnectivityState;
  queuedCount: number;
  oldestQueuedAgeMs: number;
  disconnectCount: number;
  consecutiveFailures: number;
  firstUnreachableAt: number | null;
  lastDisconnectAt: number | null;
  lastRecoveredAt: number | null;
  queuedPeak: number;
  /** True when oldestQueuedAgeMs > queueVisibleAfterMs (taskbar hint). */
  queueVisible: boolean;
};

export type WrapOptions = {
  command: string;
  payload?: Record<string, unknown>;
  /** Skip retry queue (health, SCA verify, non-critical polls). */
  skipQueue?: boolean;
  /** Background / widget poll — never enqueue, never drive overlay. */
  isNonCritical?: boolean;
  signal?: AbortSignal;
  /** Request timeout used for disconnect classification. */
  requestTimeoutMs?: number;
  /** Override read detection for coalesce. */
  isRead?: boolean;
};

export type CommandConnectivityOptions = {
  /** Health probe — any resolved HTTP response means reachable. Throw on transport fail. */
  healthProbe?: () => Promise<void>;
  /** Whether the session is authenticated (affects down threshold). */
  isAuthenticated?: () => boolean;
  /** Logged-in: show overlay after this many ms unreachable. Default 20_000. */
  downAfterMsAuthenticated?: number;
  /** Anonymous: show overlay after this many ms. Default 10_000. */
  downAfterMsAnonymous?: number;
  /** Show queue count in UI after this age. Default 1_000. */
  queueVisibleAfterMs?: number;
  maxAttempts?: number;
  retryWindowMs?: number;
  /** Health probe interval while degraded/down. Default 2_000. */
  probeIntervalMs?: number;
  logger?: Logger;
  now?: () => number;
  /** Emit when state transitions to/from down (portal maps to backend-down/up). */
  onDownChange?: (down: boolean) => void;
  /** Optional clock for retry delays (tests). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

type QueuedEntry<T> = {
  id: string;
  command: string;
  coalesceKey: string | null;
  enqueuedAt: number;
  attemptsLeft: number;
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
};

let entrySeq = 0;

function stablePayloadKey(payload: Record<string, unknown> | undefined): string {
  if (!payload || typeof payload !== 'object') return '';
  try {
    return JSON.stringify(payload, Object.keys(payload).sort());
  } catch {
    return String(Math.random());
  }
}

export class CommandConnectivityController {
  private state: ConnectivityState = 'ok';
  private queued: QueuedEntry<unknown>[] = [];
  private disconnectCount = 0;
  private consecutiveFailures = 0;
  private firstUnreachableAt: number | null = null;
  private lastDisconnectAt: number | null = null;
  private lastRecoveredAt: number | null = null;
  private queuedPeak = 0;
  private listeners = new Set<(s: ConnectivitySnapshot) => void>();
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private probing = false;
  private readonly opts: Required<
    Pick<
      CommandConnectivityOptions,
      | 'downAfterMsAuthenticated'
      | 'downAfterMsAnonymous'
      | 'queueVisibleAfterMs'
      | 'maxAttempts'
      | 'retryWindowMs'
      | 'probeIntervalMs'
    >
  > &
    CommandConnectivityOptions;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly logger: Logger;

  constructor(opts: CommandConnectivityOptions = {}) {
    this.opts = {
      downAfterMsAuthenticated: opts.downAfterMsAuthenticated ?? 20_000,
      downAfterMsAnonymous: opts.downAfterMsAnonymous ?? 10_000,
      queueVisibleAfterMs: opts.queueVisibleAfterMs ?? 1_000,
      maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      retryWindowMs: opts.retryWindowMs ?? DEFAULT_RETRY_WINDOW_MS,
      probeIntervalMs: opts.probeIntervalMs ?? 2_000,
      ...opts,
    };
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? sleepMs;
    this.logger = opts.logger ?? noopLogger;
  }

  getSnapshot(): ConnectivitySnapshot {
    const now = this.now();
    const oldest =
      this.queued.length > 0
        ? Math.min(...this.queued.map((q) => q.enqueuedAt))
        : null;
    const oldestQueuedAgeMs = oldest != null ? Math.max(0, now - oldest) : 0;
    return {
      state: this.state,
      queuedCount: this.queued.length,
      oldestQueuedAgeMs,
      disconnectCount: this.disconnectCount,
      consecutiveFailures: this.consecutiveFailures,
      firstUnreachableAt: this.firstUnreachableAt,
      lastDisconnectAt: this.lastDisconnectAt,
      lastRecoveredAt: this.lastRecoveredAt,
      queuedPeak: this.queuedPeak,
      queueVisible: oldestQueuedAgeMs > this.opts.queueVisibleAfterMs,
    };
  }

  subscribe(listener: (s: ConnectivitySnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setAuthenticated(fn: () => boolean): void {
    this.opts.isAuthenticated = fn;
  }

  setHealthProbe(fn: () => Promise<void>): void {
    this.opts.healthProbe = fn;
  }

  /**
   * Report a transport failure from outside wrap (e.g. axios interceptor for
   * non-command GETs). Does not enqueue; only advances degraded/down.
   */
  reportTransportFailure(error?: unknown, requestTimeoutMs?: number): void {
    if (
      error != null &&
      !isTransportDisconnect({ error, requestTimeoutMs })
    ) {
      return;
    }
    this.onDisconnect();
  }

  /** Report successful reachability (command or health). */
  reportReachable(): void {
    this.onRecovered();
  }

  /**
   * Wrap a one-shot transport call with retry queue on disconnect.
   */
  async wrap<T>(execute: () => Promise<T>, options: WrapOptions): Promise<T> {
    const skip =
      options.skipQueue === true ||
      options.isNonCritical === true ||
      options.signal?.aborted === true;

    try {
      const result = await execute();
      this.onRecovered();
      return result;
    } catch (err) {
      if (
        skip ||
        !isTransportDisconnect({
          error: err,
          requestTimeoutMs: options.requestTimeoutMs,
        })
      ) {
        // Non-critical / non-disconnect: do not flip connectivity.
        throw err;
      }

      this.onDisconnect();

      if (skip) throw err;

      return this.enqueueRetry(execute, options, err);
    }
  }

  destroy(): void {
    this.stopProbe();
    const pending = [...this.queued];
    this.queued = [];
    for (const q of pending) {
      q.reject(Object.assign(new Error('Connectivity controller destroyed'), {
        isBackendDown: true,
      }));
    }
    this.listeners.clear();
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const l of this.listeners) {
      try {
        l(snap);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  private isAuth(): boolean {
    return this.opts.isAuthenticated?.() === true;
  }

  private downThresholdMs(): number {
    return this.isAuth()
      ? this.opts.downAfterMsAuthenticated
      : this.opts.downAfterMsAnonymous;
  }

  private setState(next: ConnectivityState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    if (next === 'down' && prev !== 'down') {
      this.opts.onDownChange?.(true);
    } else if (next !== 'down' && prev === 'down') {
      this.opts.onDownChange?.(false);
    }
    this.emit();
  }

  private onDisconnect(): void {
    const now = this.now();
    this.disconnectCount += 1;
    this.consecutiveFailures += 1;
    this.lastDisconnectAt = now;
    if (this.firstUnreachableAt == null) this.firstUnreachableAt = now;

    if (this.state === 'ok') {
      this.setState('degraded');
    } else {
      this.emit();
    }

    this.maybePromoteDown();
    this.startProbe();
  }

  private onRecovered(): void {
    if (this.state === 'ok' && this.queued.length === 0) {
      this.consecutiveFailures = 0;
      return;
    }
    const wasDown = this.state === 'down';
    this.consecutiveFailures = 0;
    this.firstUnreachableAt = null;
    this.lastRecoveredAt = this.now();
    this.stopProbe();
    this.setState('ok');
    if (wasDown) {
      this.logger.info?.('region reachable again');
    }
    // Flush: remaining queued items retry immediately (no extra delay).
    void this.flushQueueImmediate();
  }

  private maybePromoteDown(): void {
    if (this.state === 'down') return;
    const first = this.firstUnreachableAt;
    if (first == null) return;
    const elapsed = this.now() - first;
    if (elapsed >= this.downThresholdMs()) {
      this.setState('down');
      this.logger.warn?.('region unreachable — overlay', {
        elapsedMs: elapsed,
        authenticated: this.isAuth(),
      });
    }
  }

  private startProbe(): void {
    if (this.probeTimer || !this.opts.healthProbe) return;
    this.probeTimer = setInterval(() => {
      void this.runProbe();
    }, this.opts.probeIntervalMs);
    void this.runProbe();
  }

  private stopProbe(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private async runProbe(): Promise<void> {
    if (!this.opts.healthProbe || this.probing) return;
    if (this.state === 'ok') return;
    this.probing = true;
    try {
      await this.opts.healthProbe();
      this.onRecovered();
    } catch (err) {
      if (isTransportDisconnect({ error: err, requestTimeoutMs: 5_000 })) {
        this.consecutiveFailures += 1;
        this.maybePromoteDown();
        this.emit();
      } else {
        // Any HTTP response (even 404) means reachable
        this.onRecovered();
      }
    } finally {
      this.probing = false;
    }
  }

  private enqueueRetry<T>(
    execute: () => Promise<T>,
    options: WrapOptions,
    firstError: unknown,
  ): Promise<T> {
    const isRead =
      options.isRead !== undefined
        ? options.isRead
        : isLikelyReadCommand(options.command);
    const coalesceKey = isRead
      ? `${options.command}::${stablePayloadKey(options.payload)}`
      : null;

    if (coalesceKey) {
      const existing = this.queued.find((q) => q.coalesceKey === coalesceKey);
      if (existing) {
        return new Promise<T>((resolve, reject) => {
          const prevResolve = existing.resolve;
          const prevReject = existing.reject;
          existing.resolve = (v) => {
            prevResolve(v);
            resolve(v as T);
          };
          existing.reject = (e) => {
            prevReject(e);
            reject(e);
          };
        });
      }
    }

    const delays = computeRetryDelaysMs({
      maxAttempts: this.opts.maxAttempts,
      windowMs: this.opts.retryWindowMs,
      jitterFactor: this.opts.random ? undefined : 0,
      random: this.opts.random ?? (() => 0.5),
    });

    return new Promise<T>((resolve, reject) => {
      const entry: QueuedEntry<T> = {
        id: `q_${++entrySeq}`,
        command: options.command,
        coalesceKey,
        enqueuedAt: this.now(),
        attemptsLeft: this.opts.maxAttempts - 1,
        run: execute,
        resolve,
        reject,
        signal: options.signal,
        requestTimeoutMs: options.requestTimeoutMs,
      };
      this.queued.push(entry as QueuedEntry<unknown>);
      this.queuedPeak = Math.max(this.queuedPeak, this.queued.length);
      this.emit();

      void this.processEntry(entry as QueuedEntry<unknown>, delays, firstError);
    });
  }

  private removeEntry(id: string): void {
    this.queued = this.queued.filter((q) => q.id !== id);
    this.emit();
  }

  private async processEntry(
    entry: QueuedEntry<unknown>,
    delays: number[],
    _firstError: unknown,
  ): Promise<void> {
    let delayIdx = 0;
    while (entry.attemptsLeft > 0) {
      if (entry.signal?.aborted) {
        this.removeEntry(entry.id);
        entry.reject(
          Object.assign(new Error('Aborted'), { name: 'AbortError', code: 'TIMEOUT' }),
        );
        return;
      }

      const delay = delays[delayIdx] ?? delays[delays.length - 1] ?? 3_333;
      delayIdx += 1;
      try {
        await this.sleep(delay, entry.signal);
      } catch (abortErr) {
        this.removeEntry(entry.id);
        entry.reject(abortErr);
        return;
      }

      // If recovered while waiting, flush path may already be running; still try.
      try {
        const result = await entry.run();
        this.removeEntry(entry.id);
        this.onRecovered();
        entry.resolve(result);
        return;
      } catch (err) {
        entry.attemptsLeft -= 1;
        if (
          !isTransportDisconnect({
            error: err,
            requestTimeoutMs: entry.requestTimeoutMs,
          })
        ) {
          this.removeEntry(entry.id);
          entry.reject(err);
          return;
        }
        this.onDisconnect();
        if (entry.attemptsLeft <= 0) {
          this.removeEntry(entry.id);
          // Anonymous: retries exhausted → promote down sooner
          if (!this.isAuth() && this.state !== 'down') {
            this.setState('down');
          }
          entry.reject(
            Object.assign(
              err instanceof Error ? err : new Error(String(err)),
              { isBackendDown: true },
            ),
          );
          return;
        }
      }
    }
  }

  private async flushQueueImmediate(): Promise<void> {
    const pending = [...this.queued];
    for (const entry of pending) {
      if (!this.queued.find((q) => q.id === entry.id)) continue;
      try {
        const result = await entry.run();
        this.removeEntry(entry.id);
        entry.resolve(result);
      } catch (err) {
        if (
          isTransportDisconnect({
            error: err,
            requestTimeoutMs: entry.requestTimeoutMs,
          })
        ) {
          // Still down — leave in queue / let processEntry continue
          this.onDisconnect();
          continue;
        }
        this.removeEntry(entry.id);
        entry.reject(err);
      }
    }
  }
}

/** Format a short tooltip for taskbar (English; portal may i18n later). */
export function formatConnectivityTooltip(snap: ConnectivitySnapshot): string {
  const parts: string[] = [];
  if (snap.queueVisible && snap.queuedCount > 0) {
    parts.push(
      `${snap.queuedCount} command${snap.queuedCount === 1 ? '' : 's'} waiting`,
    );
  }
  if (snap.disconnectCount > 0) {
    parts.push(
      `${snap.disconnectCount} disconnect${snap.disconnectCount === 1 ? '' : 's'} this session`,
    );
  }
  if (snap.state === 'degraded') parts.push('reconnecting…');
  if (snap.state === 'down') parts.push('service unavailable');
  return parts.join(' · ') || 'AI workloads';
}
