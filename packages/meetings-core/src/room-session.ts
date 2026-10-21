/**
 * Room media session contract (@nexus/meetings-core).
 *
 * A meeting creates a normal linked conversation room. Voice/WebRTC and the 3D
 * scene ride the **same room rails** as DMs with agents, so this module defines
 * one shape for "who is in the room and over which transport" plus the agent
 * moderation actions already supported in group conversations (mute, disable
 * listening, and per-participant volume).
 *
 * It is transport-descriptive only — no ICE/SFU implementation. The desktop,
 * portal, and mobile adapters subscribe to a room and render the roster.
 */

export type ParticipantKind = 'user' | 'agent' | 'virtual_agent' | 'asset_agent';

/** How a participant's media is delivered to the viewer. */
export type MediaTransport = 'none' | 'audio' | 'video' | 'video_screenshare';

export type MeetingParticipant = {
  id: string;
  kind: ParticipantKind;
  displayName: string;
  avatarUrl?: string | null;
  /** Voice call sid, when this participant has an active call leg. */
  callSid?: string | null;
  /** Transport the viewer receives for this participant. */
  transport: MediaTransport;
  muted: boolean;
  /** Agents can have listening disabled (they still exist but do not hear). */
  listening: boolean;
  /** Per-participant playback volume, 0..1. Agents default to 1. */
  volume: number;
  speaking?: boolean;
  /** Asset agents stream their camera/metrics over the same rail. */
  isAssetStream?: boolean;
};

export type RoomMediaSession = {
  roomId: string;
  /** Conversation id backing the room (one room = one conversation). */
  conversationId: string | null;
  /** Whether the local user is publishing their own audio/video. */
  local: { audio: boolean; video: boolean; screensharing: boolean };
  /** Whether the SFU/room is recording (nexus rooms only). */
  recording: boolean;
  participants: MeetingParticipant[];
  /** Optional 3D scene bound to the room (assets cluster). */
  sceneId: string | null;
};

/** Moderation actions already implemented for group conversations with agents. */
export type ModerationAction =
  | { action: 'mute'; participantId: string; muted: boolean }
  | { action: 'disable-listening'; participantId: string; disabled: boolean }
  | { action: 'set-volume'; participantId: string; volume: number }
  | { action: 'remove'; participantId: string };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

export function createEmptyRoomSession(roomId: string, conversationId: string | null = null): RoomMediaSession {
  return {
    roomId,
    conversationId,
    local: { audio: false, video: false, screensharing: false },
    recording: false,
    participants: [],
    sceneId: null,
  };
}

/** Add or replace a participant, preserving list order by id. */
export function upsertParticipant(
  session: RoomMediaSession,
  participant: MeetingParticipant,
): RoomMediaSession {
  const idx = session.participants.findIndex((p) => p.id === participant.id);
  const participants = [...session.participants];
  if (idx >= 0) participants[idx] = { ...participants[idx], ...participant };
  else participants.push(participant);
  return { ...session, participants };
}

export function removeParticipant(session: RoomMediaSession, participantId: string): RoomMediaSession {
  return { ...session, participants: session.participants.filter((p) => p.id !== participantId) };
}

/** Only agents (VE / asset) can have listening disabled. */
export function canDisableListening(participant: MeetingParticipant): boolean {
  return participant.kind === 'agent' || participant.kind === 'virtual_agent' || participant.kind === 'asset_agent';
}

/**
 * Apply a moderation action. Returns a new session; invalid actions (e.g.
 * disabling listening for a human) are no-ops so a client cannot misuse the API.
 */
export function applyModeration(
  session: RoomMediaSession,
  action: ModerationAction,
): RoomMediaSession {
  const target = session.participants.find((p) => p.id === action.participantId);
  if (!target) return session;

  switch (action.action) {
    case 'mute':
      return upsertParticipant(session, { ...target, muted: action.muted });
    case 'disable-listening':
      if (!canDisableListening(target)) return session;
      return upsertParticipant(session, { ...target, listening: !action.disabled });
    case 'set-volume':
      return upsertParticipant(session, { ...target, volume: clamp01(action.volume) });
    case 'remove':
      return removeParticipant(session, action.participantId);
    default:
      return session;
  }
}

/** Count of active agent legs (used by the moderation summary chip). */
export function agentParticipantCount(session: RoomMediaSession): number {
  return session.participants.filter((p) => canDisableListening(p)).length;
}
