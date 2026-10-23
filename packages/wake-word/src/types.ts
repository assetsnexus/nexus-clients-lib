/**
 * Wake-word contract (plan Part W).
 *
 * TRUST INVARIANTS (do not weaken):
 *  1. A wake word is NOT authentication. It only opens a voice session.
 *  2. A wake word must never satisfy 2FA / SCA / biometric approval / device
 *     trust, and must never trigger, approve, or confirm any command.
 *  3. Detection runs fully on-device. No audio leaves the device before a wake
 *     fires and the user has an authenticated voice session.
 *  4. A private wake sample (wav) is fetched by opaque ref, kept in memory only,
 *     never logged, never sent to a model or any remote service.
 *  5. Detection is not telemetry. A wake — and equally a *false positive* — is
 *     never reported to any backend, and no detection counters/analytics are
 *     transmitted. The backend only ever sees a transcript the user explicitly
 *     submits (an ordinary user message). See {@link WAKE_WORD_TRUST}
 *     `reportsDetectionsToBackend` / `isActivityTracker`.
 */

export type WakeWordEngineKind = 'builtin' | 'custom_sample' | 'external';

export type WakeWordSurface = 'app' | 'portal' | 'asset';

export type WakeWordConfig = {
  /** Master switch. Default false — an engine must be explicitly enabled. */
  enabled: boolean;
  /** The spoken phrase, e.g. a character name. Display + prompt only. */
  phrase?: string;
  engine: WakeWordEngineKind;
  /** 0..1 detection sensitivity (engine-specific mapping). */
  sensitivity?: number;
  /** On mobile, require the foreground app to be unlocked (see appLock). */
  requireUnlocked?: boolean;
  /** Surfaces on which listening is allowed. */
  surfaces?: WakeWordSurface[];
  /**
   * Builtin engine model id, e.g. an openWakeWord `.onnx` name.
   * The artifact is resolved by the host, never a URL in the config.
   */
  modelId?: string;
  /** External engine id (bring-your-own, same interface). */
  externalEngineId?: string;
  /** Private wake-template ref (custom_sample). Never a public URL. */
  templateRef?: string;
  /** Private sample refs used to enrol a custom template on-device. */
  sampleRefs?: string[];
  /** Refuse to listen in the cloud: must always be true for v1. */
  onDeviceOnly?: boolean;
};

export type WakeWordStatus =
  | 'idle'
  | 'loading'
  | 'listening'
  | 'unavailable'
  | 'error'
  | 'stopped';

export type WakeWordEngineStatus = {
  kind: WakeWordEngineKind;
  status: WakeWordStatus;
  /** Human-safe reason when status is `unavailable` / `error`. */
  message: string | null;
  /** True when the engine is genuinely detecting (never true for a stub). */
  detecting: boolean;
};

/** A single detection. `confidence` is engine-local and must not be treated as identity. */
export type WakeWordDetection = {
  at: number;
  confidence: number | null;
  /** Opaque engine id (never audio, never PII). */
  engineId: string;
};

export type WakeWordOnWake = (detection: WakeWordDetection) => void;

/**
 * Fetch a private artifact by opaque ref. Implementations MUST fetch from the
 * user's own device-visible storage (region private upload) and MUST NOT send
 * the bytes anywhere else.
 */
export type WakeArtifactFetcher = (ref: string) => Promise<ArrayBuffer>;

/**
 * The pluggable engine. `start` may only be called after a successful `load`.
 * `onWake` fires at most once per activation; the caller is responsible for
 * opening the voice session and for stopping/re-arming listening.
 */
export interface WakeWordEngine {
  readonly kind: WakeWordEngineKind;
  /** True when this engine can actually detect phrases on this device. */
  readonly available: boolean;
  getStatus(): WakeWordEngineStatus;
  load(config: WakeWordConfig, fetchArtifact?: WakeArtifactFetcher): Promise<void>;
  start(onWake: WakeWordOnWake): Promise<void>;
  stop(): void;
  dispose(): void;
}

/**
 * Roles a wake activation may drive. Deliberately only `open_voice_session`.
 * Adding an authorization-capable role here is a security regression.
 */
export const WAKE_WORD_ALLOWED_ACTIONS = ['open_voice_session'] as const;
export type WakeWordAllowedAction = (typeof WAKE_WORD_ALLOWED_ACTIONS)[number];

/** Documented, test-enforced guarantees about what a wake is NOT. */
export const WAKE_WORD_TRUST = {
  satisfiesAuthentication: false,
  satisfiesTwoFactor: false,
  satisfiesSca: false,
  satisfiesBiometricApproval: false,
  satisfiesDeviceTrust: false,
  isSpeakerVerification: false,
  mayTriggerCommand: false,
  mayApproveCommand: false,
  audioLeavesDeviceBeforeWake: false,
  /** No detection event (true positive OR false positive) is sent to a backend. */
  reportsDetectionsToBackend: false,
  /** Wake listening is not an activity/usage tracker; it emits no telemetry. */
  isActivityTracker: false,
  /** Nothing is sent anywhere until the user explicitly submits a transcript. */
  transmitsOnlyOnUserSubmit: true,
} as const;

export function defaultWakeWordConfig(partial: Partial<WakeWordConfig> = {}): WakeWordConfig {
  const { onDeviceOnly: _ignored, ...rest } = partial;
  return {
    enabled: false,
    engine: 'builtin',
    sensitivity: 0.5,
    requireUnlocked: true,
    surfaces: ['app', 'portal'],
    ...rest,
    // Never allow a caller to relax on-device-only for v1.
    onDeviceOnly: true,
  };
}

/** True when a spoken wake may, at most, open the voice surface for this agent. */
export function wakeWordSurfaceLabel(surface: WakeWordSurface): string {
  return surface === 'portal' ? 'Portal' : surface === 'app' ? 'App' : 'Asset';
}
