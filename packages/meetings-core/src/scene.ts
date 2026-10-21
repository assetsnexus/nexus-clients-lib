/**
 * Meeting scene / agent embodiment projection (@nexus/meetings-core).
 *
 * Phase 11e: a nexus meeting is a normal linked conversation room, so the same
 * agent embodiment rail used in DMs and group chats applies verbatim in the
 * meeting `Scene` tab. This module turns the room roster + each participant's
 * presence payload (`ParticipantPresenceV1` shape) into the occupant cohort the
 * `SceneRoom`/`ClusterRoomViewer` renderer expects — no meeting-only avatar path.
 *
 * It is framework-free and dependency-free: it mirrors the `@nexus/character-kit`
 * `SceneRoomOccupant` contract structurally so the React adapter (and any other
 * host) can hand the result straight to the scene renderer.
 */

import type { MeetingParticipant, ParticipantKind, RoomMediaSession } from './room-session.js';

/**
 * Agent/user embodiment presence carried on the same rail as DMs.
 * Structurally compatible with `@nexus/chat-core` `ParticipantPresenceV1`.
 */
export type MeetingPresence = {
  vrmUrl?: string | null;
  vrmValidationStatus?: 'pending_admin' | 'rejected' | 'verified' | string | null;
  gestureManifestUrl?: string | null;
  defaultMood?: string | null;
  clothes?: unknown;
  embodiment?: Record<string, unknown> | null;
  voiceId?: string | null;
  lipSyncEnabled?: boolean;
};

export type MeetingPresenceMap = Record<string, MeetingPresence | null | undefined>;

/** Matches `@nexus/character-kit` `SceneRoomOccupant` (kept structural). */
export type MeetingSceneOccupant = {
  id: string;
  label: string;
  slotIndex: number;
  vrmUrl?: string | null;
  validationStatus?: string | null;
  mood?: string;
  statusColor: number;
  present: boolean;
  /** Meeting-specific annotations (ignored by the renderer, used by hosts/UI). */
  kind: ParticipantKind;
  agent: boolean;
  speaking: boolean;
};

/** Status colors match the cluster editor convention (ring + nametag dot). */
export const PARTICIPANT_STATUS_COLORS: Record<ParticipantKind, number> = {
  user: 0x4f9cf9,
  agent: 0xb07cff,
  virtual_agent: 0xff9f4f,
  asset_agent: 0x4ade80,
};

export function isAgentKind(kind: ParticipantKind): boolean {
  return kind !== 'user';
}

/** Effective mood for an occupant: presence default, then `neutral`. */
export function occupantMood(presence: MeetingPresence | null | undefined): string {
  return presence?.defaultMood?.trim() || 'neutral';
}

/**
 * Whether an occupant VRM may be auto-loaded. Unverified owner previews are
 * only safe when the caller explicitly opts in (`previewUnverified`); otherwise a
 * `pending_admin`/`rejected` avatar renders as a status-coloured stand-in.
 */
export function occupantAvatarPresent(
  presence: MeetingPresence | null | undefined,
  opts: { previewUnverified?: boolean } = {},
): boolean {
  const url = presence?.vrmUrl?.trim();
  if (!url) return false;
  const status = presence?.vrmValidationStatus ?? null;
  if (opts.previewUnverified) return true;
  return status === 'verified' || status == null;
}

/** One occupant per roster participant, keeping roster order (slot = index). */
export function meetingSceneOccupants(
  participants: MeetingParticipant[],
  presenceByParticipantId: MeetingPresenceMap = {},
  opts: { previewUnverified?: boolean } = {},
): MeetingSceneOccupant[] {
  return participants.map((p, slotIndex) => {
    const presence = presenceByParticipantId[p.id] ?? null;
    const present = occupantAvatarPresent(presence, opts);
    return {
      id: p.id,
      label: p.displayName,
      slotIndex,
      vrmUrl: presence?.vrmUrl ?? null,
      validationStatus: presence?.vrmValidationStatus ?? null,
      mood: occupantMood(presence),
      statusColor: PARTICIPANT_STATUS_COLORS[p.kind] ?? PARTICIPANT_STATUS_COLORS.user,
      present,
      kind: p.kind,
      agent: isAgentKind(p.kind),
      speaking: Boolean(p.speaking),
    };
  });
}

/** Convenience: project straight from a room session. */
export function meetingSceneOccupantsFromSession(
  session: RoomMediaSession,
  presenceByParticipantId: MeetingPresenceMap = {},
  opts: { previewUnverified?: boolean } = {},
): MeetingSceneOccupant[] {
  return meetingSceneOccupants(session.participants, presenceByParticipantId, opts);
}

/**
 * The single agent a meeting voice session should attach to: the first agent by
 * roster order. Returns null when the room has no agent (voice then targets
 * nothing and the host must pick a 1:1 DM instead).
 */
export function primaryMeetingAgent(session: RoomMediaSession): MeetingParticipant | null {
  return session.participants.find((p) => isAgentKind(p.kind)) ?? null;
}

/** Whether a room has anything an agent embodiment surface can render. */
export function hasSceneAgents(session: RoomMediaSession): boolean {
  return session.participants.some((p) => isAgentKind(p.kind));
}
