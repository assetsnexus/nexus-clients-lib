/**
 * Chat-core wake-word surface (plan Part W2).
 *
 * chat-core stays framework-free and does NOT depend on `@nexus/wake-word`; the
 * host injects an engine that satisfies {@link WakeWordEngineLike}. The
 * controller owns the idle `wake_listening` state that sits *ahead* of
 * `startBrowserCall`.
 *
 * TRUST INVARIANT: `onWake` can only call `openVoiceSession`. This module has no
 * command client, no approval path, and never touches 2FA/SCA/biometric/device
 * trust. `authenticated` is always false.
 */

export type WakeSurfaceState =
  | 'off'
  | 'wake_listening'
  | 'opening'
  | 'active'
  | 'unavailable'
  | 'suspended';

export type WakeWordEngineLike = {
  readonly available?: boolean;
  getStatus(): { status: string; detecting: boolean; message?: string | null };
  load(config: Record<string, unknown>, fetchArtifact?: WakeArtifactFetcherLike): Promise<void>;
  start(onWake: (detection: WakeDetectionLike) => void): Promise<void>;
  stop(): void;
  dispose(): void;
};

export type WakeDetectionLike = {
  at: number;
  confidence: number | null;
  engineId: string;
};

/**
 * Fetch a private wake sample by opaque ref. Implementations must only read
 * device-visible private storage and must never forward bytes to a model or log
 * them.
 */
export type WakeArtifactFetcherLike = (ref: string) => Promise<ArrayBuffer>;

export type WakeWordSurfaceConfig = {
  enabled: boolean;
  phrase?: string;
  engine?: string;
  sensitivity?: number;
  requireUnlocked?: boolean;
  surfaces?: string[];
  templateRef?: string;
  sampleRefs?: string[];
  [key: string]: unknown;
};

export type WakeSurfaceStateSnapshot = {
  state: WakeSurfaceState;
  /** True only while an actual on-device detector is armed. */
  listening: boolean;
  /** True when the detector is genuinely running (drives the mic indicator). */
  micActive: boolean;
  optedIn: boolean;
  phrase: string | null;
  message: string | null;
  surface: string;
};

export type WakeVoiceOpenRequest = {
  reason: 'wake_word';
  detection: WakeDetectionLike;
  surface: string;
  /** Always false: a wake never proves identity. */
  authenticated: false;
};

export type WakeControllerDeps = {
  surface: string;
  config?: WakeWordSurfaceConfig | null;
  engine?: WakeWordEngineLike | null;
  fetchArtifact?: WakeArtifactFetcherLike | null;
  /**
   * Opens the voice session (`startBrowserCall` in the chat surface). MUST NOT
   * authenticate or dispatch commands.
   */
  openVoiceSession: (request: WakeVoiceOpenRequest) => void | Promise<void>;
  isUnlocked?: () => boolean;
  isSurfaceOpen?: () => boolean;
  onStateChange?: (snapshot: WakeSurfaceStateSnapshot) => void;
  logger?: { debug?: Function; warn?: Function };
};

function normalizeConfig(raw: WakeWordSurfaceConfig | null | undefined): WakeWordSurfaceConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.enabled !== true) return null;
  // Never allow a caller to relax on-device-only.
  return { ...raw, enabled: true };
}

export function createWakeController(deps: WakeControllerDeps) {
  let config = normalizeConfig(deps.config);
  let engine = deps.engine ?? null;
  let optedIn = false;
  let state: WakeSurfaceState = 'off';
  let armed = false;
  let message: string | null = null;
  let disposed = false;
  const listeners = new Set<(snapshot: WakeSurfaceStateSnapshot) => void>();

  const isUnlocked = deps.isUnlocked ?? (() => true);
  const isSurfaceOpen = deps.isSurfaceOpen ?? (() => true);

  function snapshot(): WakeSurfaceStateSnapshot {
    const status = engine?.getStatus();
    const detecting = Boolean(status?.detecting) && armed;
    return {
      state,
      listening: state === 'wake_listening' && detecting,
      micActive: state === 'wake_listening' && detecting,
      optedIn,
      phrase: config?.phrase ?? null,
      message,
      surface: deps.surface,
    };
  }

  function emit(): void {
    const snap = snapshot();
    deps.onStateChange?.(snap);
    listeners.forEach((l) => l(snap));
  }

  function setState(next: WakeSurfaceState, nextMessage: string | null = null): void {
    if (state === next && message === nextMessage) return;
    state = next;
    message = nextMessage;
    emit();
  }

  function gatesOpen(): boolean {
    if (!config?.enabled) return false;
    if (config.requireUnlocked && !isUnlocked()) return false;
    if (config.surfaces && !config.surfaces.includes(deps.surface)) return false;
    if (!isSurfaceOpen()) return false;
    return true;
  }

  async function arm(): Promise<boolean> {
    if (disposed || !optedIn) return false;
    if (!engine) {
      setState('unavailable', 'Wake word is not available on this surface.');
      return false;
    }
    if (!gatesOpen()) {
      setState(state === 'off' ? 'off' : 'suspended');
      return false;
    }
    if (!armed) {
      await engine.load(config as Record<string, unknown>, deps.fetchArtifact ?? undefined);
      await engine.start((detection) => handleWake(detection));
      armed = true;
    }
    const status = engine.getStatus();
    if (status.detecting) {
      setState('wake_listening');
      return true;
    }
    setState(
      status.status === 'unavailable' ? 'unavailable' : 'off',
      status.message ?? (engine.available === false ? 'Wake word is unavailable.' : null),
    );
    return false;
  }

  function disarm(): void {
    if (!armed) return;
    try {
      engine?.stop();
    } catch {
      /* ignore */
    }
    armed = false;
  }

  function handleWake(detection: WakeDetectionLike): void {
    // Only opens the voice session. No auth, no command, no approval, no 2FA.
    disarm();
    setState('opening');
    try {
      void Promise.resolve(
        deps.openVoiceSession({
          reason: 'wake_word',
          detection,
          surface: deps.surface,
          authenticated: false,
        }),
      ).catch(() => {
        if (optedIn) void arm();
      });
    } catch {
      if (optedIn) void arm();
    }
  }

  return {
    getState(): WakeSurfaceStateSnapshot {
      return snapshot();
    },
    subscribe(listener: (snapshot: WakeSurfaceStateSnapshot) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Install / replace the agent-level wake config (from the presence payload). */
    configure(next: WakeWordSurfaceConfig | null | undefined, nextEngine?: WakeWordEngineLike | null): void {
      config = normalizeConfig(next);
      if (nextEngine !== undefined) {
        disarm();
        engine = nextEngine;
      }
      if (!config?.enabled) {
        optedIn = false;
        disarm();
        setState('off');
        return;
      }
      // Config changed => engines must reload with the new phrase/model.
      if (optedIn) {
        disarm();
        void arm();
      } else {
        setState(state === 'off' ? 'off' : 'off');
      }
      emit();
    },
    /** User opts in to wake listening (portal/app toggle). */
    async optIn(): Promise<boolean> {
      if (disposed) return false;
      if (!config?.enabled) {
        setState('off', 'Wake word is disabled for this agent.');
        return false;
      }
      optedIn = true;
      return arm();
    },
    optOut(): void {
      optedIn = false;
      disarm();
      setState('off');
    },
    /** Re-arm after the surface reopens / app unlocks. */
    async refresh(): Promise<boolean> {
      if (!optedIn) return false;
      return arm();
    },
    /** Voice session started; pause listening while it runs. */
    suspendForSession(): void {
      disarm();
      setState(optedIn && gatesOpen() ? 'active' : 'suspended');
    },
    /** Voice session ended; re-arm if the user is still opted in. */
    async resumeAfterSession(): Promise<boolean> {
      if (!optedIn) return false;
      return arm();
    },
    /** Surface hidden or app locked: gate off without losing the opt-in. */
    suspend(): void {
      disarm();
      setState(optedIn ? 'suspended' : 'off');
    },
    dispose(): void {
      disposed = true;
      disarm();
      try {
        engine?.dispose();
      } catch {
        /* ignore */
      }
      listeners.clear();
      setState('off');
    },
  };
}

export type WakeController = ReturnType<typeof createWakeController>;
