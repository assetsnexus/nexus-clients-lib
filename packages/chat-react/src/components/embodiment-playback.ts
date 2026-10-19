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
