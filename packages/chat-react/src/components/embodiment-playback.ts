/**
 * Plan Part C1 — chat voice-canvas embodiment playback.
 *
 * Turns assistant text into character-kit inline-tag playback, and fires the
 * greeting / farewell routines around a voice session. Pure functions so the
 * behaviour is unit-testable without a DOM or Three.js.
 *
 * Tolerant by design: when the presence payload carries no `embodiment`
 * profile, callers fall back to plain `playInlineTags` (current behaviour).
 */

import type { ParticipantPresenceV1 } from '../presence/participant-presence.js';

export type EmbodimentFace = 'public' | 'owner';

export type EmbodimentProfileLike = Record<string, unknown> | null | undefined;

/** Minimal host surface this helper drives (matches CharacterHostLike). */
export type EmbodimentPlaybackHost = {
  playInlineTags?: (
    text: string,
    opts?: { enabled?: boolean; source?: string; locomotionOnly?: boolean },
  ) => unknown;
  playEmbodimentInlineTags?: (
    text: string,
    opts?: {
      enabled?: boolean;
      source?: string;
      locomotionOnly?: boolean;
      face?: EmbodimentFace;
    },
  ) => unknown;
  playEmbodimentRoutine?: (
    name: string,
    opts?: { source?: string; face?: EmbodimentFace },
  ) => unknown;
  /** Ambient mood setter (character-kit `CompanionHost.setMood`). */
  setMood?: (mood: string, source?: string, detail?: string) => boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Read the embodiment profile from a presence payload (Part C1 shape), tolerant
 * of nesting and absence.
 */
export function readEmbodimentProfile(
  presence: ParticipantPresenceV1 | null | undefined,
): EmbodimentProfileLike {
  if (!presence) return null;
  const own = (presence as { embodiment?: unknown }).embodiment;
  if (isRecord(own)) return own;
  if (own === null) return null;
  // Some payloads nest the profile under `settings.embodiment`.
  const settings = (presence as { settings?: unknown }).settings;
  if (isRecord(settings) && isRecord(settings.embodiment)) return settings.embodiment;
  return null;
}

/** True when a profile enables lip-sync explicitly (default keep current). */
export function embodimentLipSyncEnabled(
  profile: EmbodimentProfileLike,
): boolean | undefined {
  if (!isRecord(profile)) return undefined;
  return typeof profile.lipSyncEnabled === 'boolean' ? profile.lipSyncEnabled : undefined;
}

/** Which face is being embodied; defaults to `owner` (self-preview). */
export function resolveEmbodimentFace(
  presence: ParticipantPresenceV1 | null | undefined,
  fallback: EmbodimentFace = 'owner',
): EmbodimentFace {
  const raw = (presence as { embodimentFace?: unknown } | null | undefined)?.embodimentFace;
  if (raw === 'public' || raw === 'owner') return raw;
  return fallback;
}

/**
 * Play the inline tags in an assistant turn. Prefers the embodiment-aware host
 * method (applies face caps + zen mode + gesture aliases); falls back to plain
 * `playInlineTags`; no-ops when the host exposes neither.
 *
 * Returns true when playback was dispatched to the host.
 */
export function playAssistantEmbodiment(
  host: EmbodimentPlaybackHost | null | undefined,
  text: string,
  opts: { face?: EmbodimentFace; profile?: EmbodimentProfileLike; enabled?: boolean } = {},
): boolean {
  if (!host || !text || !text.trim()) return false;
  const enabled = opts.enabled !== false;
  if (host.playEmbodimentInlineTags) {
    // Embodiment-aware path applies face caps, zen mode and gesture aliases.
    void host.playEmbodimentInlineTags(text, { enabled, source: 'chat', face: opts.face });
    return true;
  }
  // Fallback: plain inline-tag playback keeps the pre-C1 behaviour.
  if (host.playInlineTags) {
    void host.playInlineTags(text, { enabled, source: 'chat' });
    return true;
  }
  return false;
}

/**
 * Fire a session routine (greeting on open, farewell on close). No-ops when the
 * host has no routine support or the profile defines no such routine.
 */
export function playSessionRoutine(
  host: EmbodimentPlaybackHost | null | undefined,
  routine: 'greeting' | 'farewell',
  opts: { face?: EmbodimentFace } = {},
): boolean {
  if (!host?.playEmbodimentRoutine) return false;
  void host.playEmbodimentRoutine(routine, { source: 'session', face: opts.face });
  return true;
}

/**
 * Apply the ambient mood the agent's emotion engine produced for a turn.
 *
 * `presenceMood` arrives on the turn (from `emotionLevers.presenceMood`); it is
 * the engine's vocabulary (`calm` / `happy` / `alert` / `sad` / `energetic` /
 * `neutral`) which the character host aliases onto a `PRESENCE_MOODS` id. An
 * empty/unknown value is a no-op so the profile default stays in force.
 *
 * Returns true when a mood was actually dispatched.
 */
export function applyTurnPresenceMood(
  host: EmbodimentPlaybackHost | null | undefined,
  presenceMood: string | null | undefined,
): boolean {
  if (!host?.setMood) return false;
  const mood = typeof presenceMood === 'string' ? presenceMood.trim() : '';
  if (!mood) return false;
  // `setMood` returns false for an unchanged/unknown mood — that is fine.
  host.setMood(mood, 'agent', 'emotion');
  return true;
}

/** Minimal companion-state surface `bindCompanionHost` needs (plan §P6c). */
export type CompanionStateLike = {
  presenceMood?: string | null;
  voiceStyleHint?: string | null;
  phase?: 'idle' | 'listening' | 'thinking' | 'speaking';
  lastReactionBeat?: { seq: number; cue: string; mood?: string | null } | null;
  /** Profile default mood, restored after a transient status motion. */
  defaultMood?: string | null;
};

export type CompanionHostOptions = {
  face?: EmbodimentFace;
  /** Cooldown (ms) for the `onListen` routine so typing does not spam it. */
  listenCooldownMs?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
  /** Called after a beat is dispatched so the host can persist `playedSeq`. */
  onBeatPlayed?: (seq: number) => void;
};

/**
 * Plan §P6c — drive any `EmbodimentPlaybackHost` from a framework-free
 * `CompanionState`, across React, Desktop, Mobile and Vue without duplicating
 * the rules in each app.
 *
 * What it fixes, and why each part is load-bearing:
 *
 *  - **Mood without a new turn.** The previous React binding only applied a mood
 *    when `pending.length > 0`, so a silent warm `skip` tick (or an async
 *    post-turn appraisal) could never animate the avatar. This reacts to a
 *    `presenceMood` *change* directly.
 *  - **Reaction beats.** A beat carried by the mood rail plays once per `seq`
 *    via `playAssistantEmbodiment`, so an invisible shift can still fire a
 *    one-shot gesture + face and kick the new mood's idle fidget pool.
 *  - **`onListen` / `onThink` routines.** `embodiment-profile.ts` defines them
 *    but nothing ever called them; the phase machine is their only caller.
 *  - **No `neutral` clobber.** Leaving `thinking` restores the live emotion mood
 *    (or the profile default), never a hardcoded `neutral`.
 *
 * Returns an `update` function; call it on every companion-state change. It is
 * cheap and idempotent, so a caller may call it more often than needed.
 */
export function bindCompanionHost(
  host: EmbodimentPlaybackHost | null | undefined,
  opts: CompanionHostOptions = {},
): (state: CompanionStateLike | null | undefined) => void {
  const face = opts.face ?? 'owner';
  const listenCooldownMs = opts.listenCooldownMs ?? 4000;
  const now = opts.now ?? (() => Date.now());
  let lastMood: string | null = null;
  let lastPhase: CompanionStateLike['phase'] = undefined;
  let lastBeatSeq: number | null = null;
  // `-Infinity` so the *first* listen is never swallowed by the cooldown; the
  // cooldown exists to stop typing from re-firing the routine on every keystroke.
  let lastListenAt = Number.NEGATIVE_INFINITY;

  const applyMood = (mood: string) => {
    applyTurnPresenceMood(host, mood);
    lastMood = mood;
  };

  return (state) => {
    if (!host || !state) return;

    // 1. Mood: react to a *change*, not to a new turn.
    const mood = typeof state.presenceMood === 'string' ? state.presenceMood.trim() : '';
    if (mood && mood !== lastMood) {
      applyMood(mood);
    }

    // 2. One-shot reaction beat, once per seq.
    const beat = state.lastReactionBeat;
    if (beat?.cue && (lastBeatSeq == null || beat.seq > lastBeatSeq)) {
      playAssistantEmbodiment(host, beat.cue, { face, enabled: true });
      lastBeatSeq = beat.seq;
      // A beat can set a mood of its own (the frame may carry both).
      if (beat.mood && beat.mood !== lastMood) {
        applyMood(beat.mood);
      }
      opts.onBeatPlayed?.(beat.seq);
    }

    // 3. Phase routines.
    const phase = state.phase;
    if (phase !== lastPhase) {
      if (phase === 'listening') {
        const t = now();
        if (t - lastListenAt >= listenCooldownMs) {
          lastListenAt = t;
          void host.playEmbodimentRoutine?.('onListen', { source: 'companion', face });
        }
      } else if (phase === 'thinking') {
        void host.playEmbodimentRoutine?.('onThink', { source: 'companion', face });
      } else if (lastPhase === 'thinking' || lastPhase === 'speaking') {
        // Leaving a busy phase restores the emotion mood instead of a hardcoded
        // `neutral` — the §P6c clobber fix. Re-assert it **unconditionally**: the
        // status-motion hook is a second writer of `setMood` and will have
        // clobbered the avatar to a status mood while it was "thinking", so
        // deduping against our own last value would leave the clobber in place.
        const restore = mood || (state.defaultMood ?? '');
        if (restore) {
          applyTurnPresenceMood(host, restore);
          lastMood = restore;
        }
      }
      lastPhase = phase;
    }
  };
}

/**
 * Extract assistant turns that have not yet been played, in order. Uses a
 * per-session seen-set keyed on a stable turn id (falls back to index+text).
 */
export function unplayedAssistantTurns(
  turns: Array<{ id?: string | number | null; role?: string; text?: string | null }>,
  seen: Set<string>,
): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  turns.forEach((turn, idx) => {
    if (turn.role !== 'assistant') return;
    const text = typeof turn.text === 'string' ? turn.text : '';
    if (!text.trim()) return;
    const key = turn.id != null ? String(turn.id) : `idx:${idx}:${text.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, text });
  });
  return out;
}
