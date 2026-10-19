/**
 * Plan Part W2/W3 — wake-word chrome helpers (pure, framework-free).
 *
 * chat-core owns the idle `wake_listening` state machine; this module only
 * derives presentation + opt-in copy from a {@link WakeSurfaceStateSnapshot}.
 *
 * TRUST INVARIANTS (mirrors `@nexus/wake-word`): a wake word is not
 * authentication. It only opens a voice session and can never satisfy
 * 2FA / SCA / biometric approval / device trust, nor trigger or approve a
 * command. Nothing here authorizes anything.
 */

/** Structurally identical to chat-core's `WakeSurfaceStateSnapshot`. */
export type WakeSurfaceStateSnapshot = {
  state: 'off' | 'wake_listening' | 'opening' | 'active' | 'unavailable' | 'suspended';
  listening: boolean;
  micActive: boolean;
  optedIn: boolean;
  phrase: string | null;
  message: string | null;
  surface: string;
};

export type WakeSurfaceState = WakeSurfaceStateSnapshot['state'];

/** Truthful, non-alarming copy for "wake is not authentication". */
export const WAKE_NOT_AUTH_COPY =
  'The wake word only opens a voice session. It never signs you in and never approves anything.';

export type WakeIndicatorView = {
  state: WakeSurfaceState;
  /** Short status word for the chip, e.g. "Listening". */
  label: string;
  /** Longer sentence; may be empty when there is nothing useful to say. */
  detail: string;
  /** True only when a real on-device detector is armed (never for a stub). */
  live: boolean;
  /** Pulse the mic dot (live + focused attention states). */
  pulse: boolean;
  /** True when the surface can offer an opt-in toggle. */
  canToggle: boolean;
  /** True when wake detection is genuinely unavailable (stub / no mic). */
  unavailable: boolean;
};

const LABELS: Record<WakeSurfaceState, string> = {
  off: 'Wake off',
  wake_listening: 'Listening',
  opening: 'Opening',
  active: 'In call',
  unavailable: 'Wake unavailable',
  suspended: 'Wake paused',
};

/** Derive the mic-indicator view. Pure; tolerates a null snapshot. */
export function wakeIndicatorView(
  snapshot: WakeSurfaceStateSnapshot | null | undefined,
): WakeIndicatorView {
  if (!snapshot) {
    return {
      state: 'off',
      label: LABELS.off,
      detail: '',
      live: false,
      pulse: false,
      canToggle: false,
      unavailable: false,
    };
  }
  const state = snapshot.state;
  const unavailable = state === 'unavailable';
  // `live` must reflect a genuinely armed detector, never an opt-in preference.
  const live = state === 'wake_listening' && snapshot.listening && snapshot.micActive;
  const phrase = snapshot.phrase?.trim() || '';
  const detail =
    snapshot.message?.trim() ||
    (unavailable
      ? 'Wake-word detection is not available on this device.'
      : state === 'wake_listening' && phrase
        ? `Say “${phrase}” to start a call.`
        : state === 'suspended'
          ? 'Wake is paused while the surface is closed or the device is locked.'
          : state === 'active'
            ? 'Wake is paused during the call.'
            : '');
  return {
    state,
    label: LABELS[state],
    detail,
    live,
    pulse: live || state === 'opening',
    canToggle: !unavailable,
    unavailable,
  };
}

/** Metadata key/value pairs for a detail popover; drops empties. */
export function wakeIndicatorFacts(
  snapshot: WakeSurfaceStateSnapshot | null | undefined,
): Array<{ label: string; value: string }> {
  if (!snapshot) return [];
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Surface', value: snapshot.surface },
    { label: 'State', value: snapshot.state.replace(/_/g, ' ') },
  ];
  if (snapshot.phrase?.trim()) facts.push({ label: 'Phrase', value: snapshot.phrase.trim() });
  // Make the trust boundary visible in the UI, not just in code.
  facts.push({ label: 'Authentication', value: 'Wake never authenticates or approves' });
  return facts;
}

/** True when a toggle should be shown for this snapshot. */
export function wakeToggleVisible(
  snapshot: WakeSurfaceStateSnapshot | null | undefined,
): boolean {
  return Boolean(snapshot) && snapshot!.state !== 'unavailable';
}

/** Read an agent wake-word config off a presence payload (tolerant). */
export type WakePresenceConfig = {
  enabled: boolean;
  phrase?: string;
  engine?: string;
  sensitivity?: number;
  requireUnlocked?: boolean;
  surfaces?: string[];
  modelId?: string;
  externalEngineId?: string;
  templateRef?: string;
  sampleRefs?: string[];
  [key: string]: unknown;
};

export function readWakeWordConfig(
  presence: { wakeWord?: Record<string, unknown> | null } | null | undefined,
): WakePresenceConfig | null {
  const raw = presence?.wakeWord;
  if (!raw || typeof raw !== 'object') return null;
  if (raw.enabled !== true) return null;
  const out: WakePresenceConfig = { enabled: true };
  if (typeof raw.phrase === 'string' && raw.phrase.trim()) out.phrase = raw.phrase.trim();
  if (typeof raw.engine === 'string' && raw.engine.trim()) out.engine = raw.engine.trim();
  if (typeof raw.sensitivity === 'number' && Number.isFinite(raw.sensitivity)) {
    out.sensitivity = Math.min(1, Math.max(0, raw.sensitivity));
  }
  if (typeof raw.requireUnlocked === 'boolean') out.requireUnlocked = raw.requireUnlocked;
  if (Array.isArray(raw.surfaces)) {
    out.surfaces = raw.surfaces.filter((s): s is string => typeof s === 'string');
  }
  if (typeof raw.modelId === 'string' && raw.modelId.trim()) out.modelId = raw.modelId.trim();
  if (typeof raw.externalEngineId === 'string' && raw.externalEngineId.trim()) {
    out.externalEngineId = raw.externalEngineId.trim();
  }
  // Private refs are needed by the on-device engine to enrol a custom template.
  // They are NEVER rendered: the UI reads `WakeSurfaceStateSnapshot` (phrase +
  // state only), so refs cannot leak into copy, logs or a model context.
  if (typeof raw.templateRef === 'string' && raw.templateRef.trim()) {
    out.templateRef = raw.templateRef.trim();
  }
  if (Array.isArray(raw.sampleRefs)) {
    out.sampleRefs = raw.sampleRefs.filter((s): s is string => typeof s === 'string');
  }
  return out;
}
