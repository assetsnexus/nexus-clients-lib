/**
 * Part D item 29 — the client-side surface model for a voice call living inside a
 * chat.
 *
 * One conversation now carries both voice utterances and typed chat, so the chat
 * UI has to know a little about a call in progress. This module is the pure,
 * framework-free part of that: what the "call in progress" banner says, which
 * bubbles are voice (mic marker), which are "posted from voice" (chat-only), and
 * how a live partial is replaced in place by the final transcript without ever
 * showing the utterance twice.
 *
 * It deliberately holds NO transport or socket code — the portal and the app
 * bind their own gateway, and this decides what to render.
 */

/** The voice-specific fields a chat message may carry (mirrors the sink output). */
export type VoiceMessageModality = 'voice' | 'chat_only' | null;

export type ChatVoiceMessageFields = {
  id: string;
  role?: string;
  text?: string;
  /** Partition key from `VoiceTranscriptSink` (absent on typed messages). */
  utteranceId?: string | null;
  modality?: VoiceMessageModality;
  callSid?: string | null;
  speakerLabel?: string | null;
};

export type CallInProgressState = {
  callSid: string | null;
  surface: 'browser' | 'app' | 'pstn' | null;
  /** True when this call has a chat surface the reader can see (item 24). */
  chatVisible: boolean;
  startedAtMs: number | null;
  /** Participants the room can see on the call controls (1 human + agent). */
  participants: Array<{ id: string; label: string; kind: 'human' | 'agent' | 'support' }>;
};

export const EMPTY_CALL_STATE: CallInProgressState = {
  callSid: null,
  surface: null,
  chatVisible: false,
  startedAtMs: null,
  participants: [],
};

export type CallBannerView = {
  visible: boolean;
  /** Short, localisable line for the banner. */
  label: string;
  /** True when the reader can act (mute, leave) on the call. */
  controlsVisible: boolean;
  elapsedSec: number | null;
};

const SURFACE_LABEL: Record<string, string> = {
  browser: 'Browser call in progress',
  app: 'Call in progress',
  pstn: 'Phone call in progress',
};

/**
 * Banner for the chat. `controlsVisible` is true in a room (so everyone can see
 * who is on the call) or for the human who owns the call; a passive reader of a
 * PSTN call still sees the banner but gets no controls.
 */
export function buildCallBanner(
  state: CallInProgressState | null | undefined,
  opts: { viewerIsOwner?: boolean; nowMs?: number } = {},
): CallBannerView {
  if (!state?.callSid) return { visible: false, label: '', controlsVisible: false, elapsedSec: null };
  const label = SURFACE_LABEL[state.surface || ''] || 'Call in progress';
  const owner = opts.viewerIsOwner === true;
  const isPstn = state.surface === 'pstn';
  const elapsedSec =
    state.startedAtMs != null
      ? Math.max(0, Math.floor(((opts.nowMs ?? Date.now()) - state.startedAtMs) / 1000))
      : null;
  return {
    visible: true,
    label,
    // A PSTN call is one human on a phone plus the agent: nobody in the room can
    // mute it, so controls show only to the call's own owner.
    controlsVisible: owner || !isPstn,
    elapsedSec,
  };
}

/** True when a message should show the little mic marker. */
export function isVoiceBubble(message: ChatVoiceMessageFields | null | undefined): boolean {
  return message?.modality === 'voice';
}

/** True when an assistant message is a "posted from voice" chat-only message. */
export function isPostedFromVoice(
  message: ChatVoiceMessageFields | null | undefined,
): boolean {
  return message?.modality === 'chat_only';
}

/** Marker text for a chat-only message, or null when it is not one. */
export function postedFromVoiceMarker(
  message: ChatVoiceMessageFields | null | undefined,
): string | null {
  return isPostedFromVoice(message) ? 'posted from voice' : null;
}

/** Speaker label fallback so an unidentified PSTN caller reads sensibly. */
export function voiceSpeakerLabel(
  message: ChatVoiceMessageFields | null | undefined,
): string | null {
  const explicit = String(message?.speakerLabel || '').trim();
  if (explicit) return explicit;
  if (!isVoiceBubble(message)) return null;
  return message?.role === 'user' ? 'Caller (phone)' : null;
}

export type PartialTranscriptEvent = {
  utteranceId: string;
  callSid?: string | null;
  role: 'user' | 'assistant';
  text: string;
  speakerLabel?: string | null;
  /** `partial` streams token by token; `final` replaces the partial in place. */
  kind: 'partial' | 'final';
};

export type TranscriptMessage = ChatVoiceMessageFields & { pending?: boolean };

/**
 * Apply one live transcript event to the message list.
 *
 * The contract the plan pins: a PARTIAL is replaced in place (never appended as
 * a new bubble), and the FINAL replaces the partial for the same `utteranceId`.
 * Dedupe is by `utteranceId`, so the same event arriving twice from the socket
 * (a replica fan-out, a client retry) cannot double-post, and the final arriving
 * twice cannot either.
 */
export function applyTranscriptEvent<T extends TranscriptMessage>(
  messages: T[],
  event: PartialTranscriptEvent,
): T[] {
  const utteranceId = String(event?.utteranceId || '').trim();
  if (!utteranceId || !event.text) return messages;
  const index = messages.findIndex((m) => m.utteranceId === utteranceId);
  const isFinal = event.kind === 'final';
  const next: T = {
    id: index >= 0 ? messages[index].id : `voice:${utteranceId}`,
    role: event.role,
    text: event.text,
    utteranceId,
    modality: 'voice',
    callSid: event.callSid ?? null,
    speakerLabel: event.speakerLabel ?? null,
    ...(isFinal ? {} : { pending: true }),
  } as T;

  if (index < 0) {
    // A final with no partial still needs to appear; a partial needs a bubble.
    return [...messages, next];
  }
  const out = [...messages];
  out[index] = next;
  return out;
}

/**
 * Merge a stored message page with the live transcript. The store is the source
 * of truth for finals (it has the server id); a live bubble for the SAME
 * `utteranceId` is dropped so the reader never sees it twice.
 */
export function mergeStoredWithLive<T extends TranscriptMessage>(
  stored: T[],
  live: T[],
): T[] {
  const storedUtterances = new Set(
    stored.map((m) => m.utteranceId).filter((u): u is string => Boolean(u)),
  );
  const keptLive = live.filter(
    (m) => !m.utteranceId || !storedUtterances.has(m.utteranceId),
  );
  return [...stored, ...keptLive];
}

export type StartCallFromRoomCheck = {
  ok: boolean;
  reason?: 'no_room' | 'not_a_member' | 'agent_not_participant' | 'contact_policy';
};

/**
 * Client-side pre-check for starting a call from a room (item 23's `roomId`).
 * The SERVER is authoritative — this only avoids an obviously-doomed call and
 * gives the UI a precise message.
 */
export function canStartCallFromRoom(input: {
  roomId?: string | null;
  viewerIsMember?: boolean;
  agentIsParticipant?: boolean;
  viewerMayTalkToAgent?: boolean;
}): StartCallFromRoomCheck {
  if (!String(input.roomId || '').trim()) return { ok: false, reason: 'no_room' };
  if (input.viewerIsMember !== true) return { ok: false, reason: 'not_a_member' };
  if (input.agentIsParticipant !== true) return { ok: false, reason: 'agent_not_participant' };
  if (input.viewerMayTalkToAgent === false) return { ok: false, reason: 'contact_policy' };
  return { ok: true };
}

/**
 * `chatVisible` may change mid-call (a client subscribes or leaves). The server
 * refreshes the session; the client should re-render the banner and the
 * "stored vs live" hint, so this returns whether the value actually changed.
 */
export function applyChatVisibility(
  state: CallInProgressState,
  chatVisible: boolean,
): CallInProgressState {
  if (state.chatVisible === chatVisible) return state;
  return { ...state, chatVisible };
}

/** Where a `post_to_chat` message went, for the agent-facing hint. */
export function deliveredHint(delivered: 'live' | 'stored' | null | undefined): string {
  return delivered === 'stored'
    ? 'Saved in this conversation — no chat is open right now.'
    : 'Posted to the chat.';
}
