/**
 * Re-attach bookkeeping for a server-side generation that outlived the page
 * (reload / navigate away and back). The socket + turn mutation live in the
 * chat controller; this owns the settle-once outcome and the idle watchdog.
 */

export type LiveAttachOutcome =
  /** Turn finished normally while attached. */
  | 'done'
  | 'error'
  /** Turn paused for approval / elevation; socket closed by the controller. */
  | 'paused'
  /** No events and the server reports the generation is no longer live. */
  | 'ended'
  /** A send / resume / conversation switch replaced the socket. */
  | 'superseded'
  /** Nothing to attach to (flag cleared, other conversation, already streaming). */
  | 'not_live'
  /** Stream endpoints unavailable or the socket failed to open. */
  | 'failed';

export interface LiveAttachResult {
  attached: boolean;
  outcome: LiveAttachOutcome;
}

export const LIVE_ATTACH_IDLE_CHECK_MS = 15_000;

export function liveAttachOutcomeForEvent(type: string | undefined): LiveAttachOutcome | null {
  switch (type) {
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'paused':
    case 'permission_elevation_request':
    case 'data_access_approval_request':
      return 'paused';
    default:
      return null;
  }
}

export interface LiveAttachSessionOptions {
  /** Resolves false only when the server confirms the generation is gone. */
  checkLive: () => Promise<boolean>;
  /** Called once when the watchdog decides the generation ended silently. */
  onEnded: () => void;
  idleMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export class LiveAttachSession {
  readonly promise: Promise<LiveAttachResult>;
  private resolve!: (r: LiveAttachResult) => void;
  private settled = false;
  private pendingOutcome: LiveAttachOutcome | null = null;
  private lastEventAt: number;
  private timer: unknown = null;
  private checking = false;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly clearIntervalFn: (handle: unknown) => void;

  constructor(private readonly o: LiveAttachSessionOptions) {
    this.promise = new Promise<LiveAttachResult>((res) => {
      this.resolve = res;
    });
    this.idleMs = Math.max(1_000, o.idleMs ?? LIVE_ATTACH_IDLE_CHECK_MS);
    this.now = o.now ?? (() => Date.now());
    this.clearIntervalFn =
      o.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.lastEventAt = this.now();
    const setIntervalFn = o.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
    this.timer = setIntervalFn(() => {
      void this.tick();
    }, this.idleMs);
  }

  get isSettled(): boolean {
    return this.settled;
  }

  /** Record an inbound stream event; terminal types fix the eventual outcome. */
  noteEvent(type: string | undefined): void {
    this.lastEventAt = this.now();
    const outcome = liveAttachOutcomeForEvent(type);
    if (outcome) this.pendingOutcome = outcome;
  }

  /** Settle once. A terminal event seen earlier wins over the close reason. */
  settle(fallback: LiveAttachOutcome): void {
    if (this.settled) return;
    this.settled = true;
    if (this.timer != null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    this.resolve({ attached: true, outcome: this.pendingOutcome ?? fallback });
  }

  /** @internal exposed for tests */
  async tick(): Promise<void> {
    if (this.settled || this.checking) return;
    if (this.now() - this.lastEventAt < this.idleMs) return;
    this.checking = true;
    try {
      const live = await this.o.checkLive();
      if (!live && !this.settled) {
        this.pendingOutcome = this.pendingOutcome ?? 'ended';
        this.o.onEnded();
      } else {
        this.lastEventAt = this.now();
      }
    } finally {
      this.checking = false;
    }
  }
}
