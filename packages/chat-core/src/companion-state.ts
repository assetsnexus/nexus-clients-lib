/**
 * Companion state (plan §P6c) — the framework-free driver for a companion view.
 *
 * Desktop, Portal (Vue 2) and the Nexus app all render the same companion, so
 * the *state machine* must not live in any one of them. This module owns:
 *
 *   - the ambient presence mood (`presenceMood` + `voiceStyleHint`), fed by
 *     assistant-turn metadata, history rehydrate, and the live
 *     `activity { kind: 'emotion_state' }` frame, and
 *   - the conversation phase (`idle` | `listening` | `thinking` | `speaking`),
 *     plus the one-shot reaction beat a silent mood shift may carry.
 *
 * Everything here is pure so it can be unit-tested without a DOM, and so
 * `chat-react` / a Vue binding can each be a thin adapter over the same rules.
 *
 * The two bugs this exists to fix:
 *
 *  1. A mood shift that arrives while nothing is being generated (a silent warm
 *     `skip` tick, or an async post-turn appraisal) had no path to the avatar at
 *     all — `VoiceLayout` only applied a mood when a new turn appeared.
 *  2. A reaction beat was only ever playable from assistant *text* tags, so an
 *     invisible mood change could not produce a one-shot gesture.
 */

import type { ChatTurn, PanelState } from './state.js';

/** The conversation phase a companion renders (drives `onListen` / `onThink`). */
export type CompanionPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

/** A one-shot gesture the server asked the companion to play. */
export interface CompanionReactionBeat {
  /**
   * Monotonic sequence so the host plays each beat exactly once. Derived from
   * the server's arrival order; a re-delivered frame must not re-play.
   */
  seq: number;
  /** The inline tag, e.g. `[look_around|surprised=35]`. */
  cue: string;
  /** The presence mood that was set with the beat (kick its idle fidget pool). */
  mood: string | null;
  /** ISO timestamp of the frame that carried it. */
  at: string;
}

/** The whole companion-facing slice of chat state. */
export interface CompanionState {
  /** Coarse avatar mood id (engine vocabulary; the host aliases it). */
  presenceMood: string | null;
  /** Prosody hint paired with `presenceMood` (`warm` / `soft` / `quick`). */
  voiceStyleHint: string | null;
  phase: CompanionPhase;
  /** Last unplayed/played beat, kept so a late-attaching host can catch up. */
  lastReactionBeat: CompanionReactionBeat | null;
  /**
   * The mood the *profile* would show with no emotion engine in play. Restored
   * when a status motion finishes, instead of hardcoding `neutral`.
   */
  defaultMood: string | null;
}

export const INITIAL_COMPANION_STATE: CompanionState = {
  presenceMood: null,
  voiceStyleHint: null,
  phase: 'idle',
  lastReactionBeat: null,
  defaultMood: null,
};

function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s ? s : null;
}

/** Read mood fields off any frame that may carry them, tolerantly. */
export function readMoodFields(data: unknown): {
  presenceMood: string | null;
  voiceStyleHint: string | null;
  reactionBeat: string | null;
} {
  if (!data || typeof data !== 'object') {
    return { presenceMood: null, voiceStyleHint: null, reactionBeat: null };
  }
  const d = data as Record<string, unknown>;
  return {
    presenceMood: trimmed(d.presenceMood),
    voiceStyleHint: trimmed(d.voiceStyleHint),
    reactionBeat: trimmed(d.reactionBeat),
  };
}

/**
 * Apply a mood-carrying payload (a stream `assistant_final` / `done`, an
 * `activity { kind: 'emotion_state' }` frame, or a rehydrated turn) onto the
 * companion state.
 *
 * A null/absent field means "leave it alone", never "clear it": the server only
 * omits a field when it has nothing to say, and a mood that silently reset to
 * `neutral` on every frame would defeat the whole rail.
 */
export function applyCompanionMood(
  state: CompanionState,
  data: unknown,
  opts: { at?: string; seq?: number } = {},
): CompanionState {
  const { presenceMood, voiceStyleHint, reactionBeat } = readMoodFields(data);
  if (!presenceMood && !voiceStyleHint && !reactionBeat) return state;
  const nextMood = presenceMood ?? state.presenceMood;
  const nextVoice = voiceStyleHint ?? state.voiceStyleHint;
  let nextBeat = state.lastReactionBeat;
  // Ignore a re-delivery of the same beat (a replay frame must not re-fire a
  // gesture the user already saw).
  if (reactionBeat && state.lastReactionBeat?.cue !== reactionBeat) {
    nextBeat = {
      seq: opts.seq ?? (state.lastReactionBeat?.seq ?? 0) + 1,
      cue: reactionBeat,
      mood: nextMood,
      at: opts.at ?? new Date().toISOString(),
    };
  }
  // Referentially stable when nothing changed: callers feed this to
  // `useSyncExternalStore`, so a mood-less / replayed frame must not re-render.
  if (
    nextMood === state.presenceMood &&
    nextVoice === state.voiceStyleHint &&
    nextBeat === state.lastReactionBeat
  ) {
    return state;
  }
  return {
    ...state,
    presenceMood: nextMood,
    voiceStyleHint: nextVoice,
    lastReactionBeat: nextBeat,
  };
}

/** Set the phase (idempotent; used by the stream/voice lifecycle). */
export function setCompanionPhase(state: CompanionState, phase: CompanionPhase): CompanionState {
  return state.phase === phase ? state : { ...state, phase };
}

/** Remember the profile's default mood (restored after a status motion). */
export function setCompanionDefaultMood(state: CompanionState, mood: string | null): CompanionState {
  const next = trimmed(mood);
  return state.defaultMood === next ? state : { ...state, defaultMood: next };
}

/**
 * The mood to *restore* when a transient status motion (`thinking` / `writing` /
 * `running`) finishes: the live emotion mood if one is set, otherwise the
 * profile default. Never a hardcoded `neutral` — that clobber is the §P6c bug.
 */
export function restoreCompanionMood(state: CompanionState): string | null {
  return state.presenceMood ?? state.defaultMood;
}

/**
 * The mood a turn carries, for history rehydrate. Newest turn with a mood wins,
 * so a re-open restores the companion exactly where the live rail left it.
 */
export function moodFromTurns(turns: readonly ChatTurn[]): {
  presenceMood: string | null;
  voiceStyleHint: string | null;
} {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role !== 'assistant') continue;
    const mood = trimmed(turn.presenceMood);
    const voice = trimmed(turn.voiceStyleHint);
    if (mood || voice) return { presenceMood: mood, voiceStyleHint: voice };
  }
  return { presenceMood: null, voiceStyleHint: null };
}

/** Fold a panel's turns into the companion state (rehydrate / prepend). */
export function applyTurnsToCompanionState(
  state: CompanionState,
  turns: readonly ChatTurn[],
): CompanionState {
  const { presenceMood, voiceStyleHint } = moodFromTurns(turns);
  if (!presenceMood && !voiceStyleHint) return state;
  return {
    ...state,
    presenceMood: presenceMood ?? state.presenceMood,
    voiceStyleHint: voiceStyleHint ?? state.voiceStyleHint,
  };
}

/**
 * Whether a beat still needs playing. The host tracks what it has played; this
 * keeps the rule in one place instead of in each app.
 */
export function pendingReactionBeat(
  state: CompanionState,
  playedSeq: number | null,
): CompanionReactionBeat | null {
  const beat = state.lastReactionBeat;
  if (!beat) return null;
  if (playedSeq != null && beat.seq <= playedSeq) return null;
  return beat;
}

/** Convenience: phase derived from a panel's own streaming flags. */
export function phaseFromPanel(panel: Pick<PanelState, 'streaming' | 'generationInProgress'> | null | undefined): CompanionPhase {
  if (!panel) return 'idle';
  if (panel.streaming || panel.generationInProgress) return 'thinking';
  return 'idle';
}
