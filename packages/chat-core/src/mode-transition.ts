/**
 * P8-8/C-4b: shared animated mode-transition primitive.
 *
 * Every chat-mode switch (chrome picker, ask<->plan<->agent, and the
 * ModeRefusalChip "switch to {required} mode" action) must render a short
 * intentional transition with a visible countdown instead of flipping the
 * mode chip silently. State and timing live here — framework-free — so the
 * chrome chip, the message-level badge, and any future surface subscribe to
 * the SAME instance and cannot disagree about which mode is "current"
 * mid-transition.
 *
 * Presentation only: `executionMode` enforcement always happens server-side
 * (the mode-switch command is dispatched independently of this timer). A
 * second `start()` call before settle supersedes the first rather than
 * queueing.
 */

export type ChatExecutionMode = 'ask' | 'plan' | 'agent';

export type ModeTransitionPhase = 'idle' | 'transitioning' | 'settled';

export type ModeTransitionState = {
  from: ChatExecutionMode | null;
  to: ChatExecutionMode | null;
  startedAt: number | null;
  durationMs: number;
  phase: ModeTransitionPhase;
  /** 0..1 — progress toward settle. 0 when idle. */
  progress: number;
  /** Milliseconds remaining until settle (0 when idle/settled). */
  remainingMs: number;
  /** `prefers-reduced-motion` — settle is immediate but countdown text stays legible. */
  reducedMotion: boolean;
};

export type ModeTransitionListener = (state: ModeTransitionState) => void;

export type ModeTransitionOptions = {
  /** Default 600ms — a confirmation affordance, not a loading spinner. */
  durationMs?: number;
  /** Explicit override; auto-detected from matchMedia when omitted. */
  reducedMotion?: boolean;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Tick cadence while transitioning (default 50ms). */
  tickMs?: number;
};

export type ModeTransitionController = {
  getState: () => ModeTransitionState;
  subscribe: (listener: ModeTransitionListener) => () => void;
  /** Start (or supersede) a transition toward `to`. */
  start: (to: ChatExecutionMode, opts?: { from?: ChatExecutionMode | null }) => void;
  /** Snap back to idle with no in-flight transition — used to recover from a failed dispatch. */
  cancel: () => void;
  destroy: () => void;
};

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function idleState(reducedMotion: boolean): ModeTransitionState {
  return {
    from: null,
    to: null,
    startedAt: null,
    durationMs: 0,
    phase: 'idle',
    progress: 0,
    remainingMs: 0,
    reducedMotion,
  };
}

export function useModeTransition(opts: ModeTransitionOptions = {}): ModeTransitionController {
  const now = opts.now ?? (() => Date.now());
  const durationMs = Math.max(0, opts.durationMs ?? 600);
  const tickMs = Math.max(16, opts.tickMs ?? 50);
  const reducedMotion = opts.reducedMotion ?? detectReducedMotion();

  let state: ModeTransitionState = idleState(reducedMotion);
  const listeners = new Set<ModeTransitionListener>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = () => listeners.forEach((l) => l(state));

  const clearTimer = () => {
    if (timer != null) clearInterval(timer);
    timer = null;
  };

  const settle = () => {
    clearTimer();
    state = { ...state, phase: 'settled', progress: 1, remainingMs: 0 };
    emit();
  };

  const tick = () => {
    if (state.phase !== 'transitioning' || state.startedAt == null) {
      clearTimer();
      return;
    }
    const elapsed = now() - state.startedAt;
    const progress = state.durationMs > 0 ? Math.min(1, elapsed / state.durationMs) : 1;
    state = { ...state, progress, remainingMs: Math.max(0, state.durationMs - elapsed) };
    emit();
    if (progress >= 1) settle();
  };

  const start: ModeTransitionController['start'] = (to, startOpts) => {
    clearTimer();
    const from = startOpts?.from ?? state.to ?? state.from ?? null;
    if (reducedMotion) {
      // Instant switch; countdown text stays legible per the reduced-motion contract.
      state = {
        from,
        to,
        startedAt: now(),
        durationMs,
        phase: 'settled',
        progress: 1,
        remainingMs: 0,
        reducedMotion: true,
      };
      emit();
      return;
    }
    state = {
      from,
      to,
      startedAt: now(),
      durationMs,
      phase: 'transitioning',
      progress: 0,
      remainingMs: durationMs,
      reducedMotion: false,
    };
    emit();
    timer = setInterval(tick, tickMs);
  };

  const cancel: ModeTransitionController['cancel'] = () => {
    clearTimer();
    state = idleState(reducedMotion);
    emit();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    cancel,
    destroy: () => {
      clearTimer();
      listeners.clear();
    },
  };
}

/** `0.4s`-style short countdown for the transition ring center label. */
export function formatModeTransitionCountdown(remainingMs: number): string {
  const sec = Math.max(0, remainingMs) / 1000;
  return `${sec.toFixed(1)}s`;
}

export function modeLabel(mode: ChatExecutionMode | string | null | undefined): string {
  if (mode === 'ask') return 'Ask';
  if (mode === 'plan') return 'Plan';
  if (mode === 'agent') return 'Agent';
  return 'unset';
}
