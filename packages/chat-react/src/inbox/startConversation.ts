import type { ChatContact, NexusChat } from '@nexus/chat-core';
import { openContactThread } from '../utils/openContactFlow.js';
import type { CreateRoomSubmit } from './CreateRoomDialog.js';
import type { ContactPickerSelection } from './ContactPickerOverlay.js';

/**
 * New-conversation flows shared by the sidebar `+` menu, the pickers, and the
 * create-room dialog. Each mirrors the portal host:
 *
 *  - "Message agent"  → `onAgentPickerSelect`: always a NEW thread
 *    (`conversationId: null` / `forceNew`), never the previous session.
 *  - "Direct message" → `onContactPickerSelect`: a `dm` room with the person.
 *    Reopening an existing thread with the same person is the default (see
 *    `findDmRoomForContact`); `forceNew` mints a fresh room instead.
 *  - "New group"      → `onCreateRoomSubmit`: a `group` room with the chosen
 *    AI / asset / human participants.
 *
 * Rooms are opened by binding the panel to the room id (there is no room
 * "conversation" to stream-init by id); `streamInit({ roomId })` opens the
 * room stream, matching `RoomsPanel`.
 */

export type StartAgentOptions = {
  /** Optional thread name the user typed in the picker. */
  title?: string;
};

/**
 * Open a brand-new thread with an agent (or asset agent). The portal's
 * `onAgentPickerSelect` uses `forceNew: true` semantics: the previous
 * conversation for the same agent is deliberately NOT reused.
 */
export async function startAgentThread(
  chat: NexusChat,
  contact: ChatContact,
  opts?: StartAgentOptions,
): Promise<{ conversationId: string | null; roomId: string | null }> {
  if (contact.type === 'asset_agent') {
    const { roomId } = await chat.createRoom({
      title: opts?.title || '',
      type: 'dm',
      aiParticipants: [
        {
          type: 'asset_agent',
          id: contact.assetId || contact.id,
          assetAgentKey: contact.assetAgentKey || undefined,
          displayName: contact.name,
        },
      ],
    });
    chat.rehydrateTurns([], { roomId, detachStream: true });
    await chat.streamInit({ roomId });
    return { conversationId: null, roomId };
  }
  const { conversationId } = await openContactThread(chat, contact.id, contact, { forceNew: true });
  return { conversationId, roomId: null };
}

/** Max DM rooms inspected when looking for a thread to resume (bounded scan). */
const DM_RESUME_SCAN_LIMIT = 25;

/**
 * Existing `dm` room between the viewer and `contactId`, if any.
 *
 * The region models a direct message as a `dm` room, so "resume the previous
 * conversation with this person" means finding that room. `listRooms` carries
 * participant *names* (not ids), so the name narrows the candidates and
 * `getRoom` confirms the participant id — a bounded scan keeps this cheap
 * enough to run while the picker is open.
 */
export async function findDmRoomForContact(
  chat: NexusChat,
  contact: Pick<ChatContact, 'id' | 'name'>,
): Promise<string | null> {
  const id = String(contact.id || '').trim();
  if (!id) return null;
  let rooms;
  try {
    rooms = await chat.listRooms();
  } catch {
    return null;
  }
  const name = String(contact.name || '').trim().toLowerCase();
  const candidates = rooms
    .filter((room) => String(room.type || '') === 'dm')
    .filter((room) => {
      if (!name) return true;
      const names = Array.isArray(room.participantNames) ? room.participantNames : [];
      return names.some((row) => String(row || '').trim().toLowerCase() === name);
    })
    .slice(0, DM_RESUME_SCAN_LIMIT);
  for (const room of candidates) {
    try {
      const detail = await chat.getRoom(room.id);
      const hit = (detail?.participants || []).some(
        (row) => String(row?.id || '').trim() === id,
      );
      if (hit) return room.id;
    } catch {
      // A room that cannot be read is not resumable; try the next candidate.
    }
  }
  return null;
}

/**
 * Every contact id that already has a `dm` room, so the picker can label the
 * rows the user can resume. One `getRoom` per DM, bounded like the resume scan.
 */
export async function dmResumeIndex(chat: NexusChat): Promise<string[]> {
  let rooms;
  try {
    rooms = await chat.listRooms();
  } catch {
    return [];
  }
  const dms = rooms.filter((room) => String(room.type || '') === 'dm').slice(0, DM_RESUME_SCAN_LIMIT);
  const ids = new Set<string>();
  for (const room of dms) {
    try {
      const detail = await chat.getRoom(room.id);
      for (const row of detail?.participants || []) {
        if (row?.type !== 'user') continue;
        const id = String(row.id || '').trim();
        if (id) ids.add(id);
      }
    } catch {
      // Unreadable room contributes nothing.
    }
  }
  return Array.from(ids);
}

/**
 * Start (or resume) a direct message with a person.
 *
 * `forceNew: false` (the default) reopens the existing `dm` room so the user
 * keeps their history; `forceNew: true` mints a fresh room, mirroring the
 * "start a new conversation" affordance. A name typed in the picker renames the
 * room, matching `onContactPickerSelect`.
 */
export async function startDirectMessage(
  chat: NexusChat,
  contact: ChatContact,
  opts?: StartAgentOptions & { forceNew?: boolean },
): Promise<{ roomId: string; resumed: boolean }> {
  const title = typeof opts?.title === 'string' ? opts.title.trim() : '';
  if (!opts?.forceNew) {
    const existing = await findDmRoomForContact(chat, contact);
    if (existing) {
      if (title) {
        await chat.updateRoom({ roomId: existing, name: title }).catch(() => undefined);
      }
      chat.rehydrateTurns([], { roomId: existing, detachStream: true });
      await chat.streamInit({ roomId: existing });
      return { roomId: existing, resumed: true };
    }
  }
  const { roomId } = await chat.createRoom({
    title,
    type: 'dm',
    participants: [{ type: 'user', id: contact.id, displayName: contact.name }],
  });
  if (title) {
    await chat.updateRoom({ roomId, name: title }).catch(() => undefined);
  }
  chat.rehydrateTurns([], { roomId, detachStream: true });
  await chat.streamInit({ roomId });
  return { roomId, resumed: false };
}

/**
 * Create a group room from the dialog payload and open it. Returns the invite
 * code when people were invited (portal shows it before opening the room).
 */
export async function createGroupRoom(
  chat: NexusChat,
  payload: CreateRoomSubmit,
): Promise<{ roomId: string; inviteCode: string | null }> {
  const { roomId } = await chat.createRoom({
    title: payload.title,
    type: 'group',
    encryptionMode: payload.encryptionMode,
    participants: payload.participants,
    aiParticipants: payload.aiParticipants,
    ...(payload.messageTtlSeconds !== null ? { messageTtlSeconds: payload.messageTtlSeconds } : {}),
  });
  let inviteCode: string | null = null;
  if (payload.createInviteForHumans) {
    try {
      const invite = await chat.createRoomInvite({ roomId });
      inviteCode = invite.inviteCode || null;
    } catch {
      inviteCode = null;
    }
  }
  if (!inviteCode) {
    chat.rehydrateTurns([], { roomId, detachStream: true });
    await chat.streamInit({ roomId });
  }
  return { roomId, inviteCode };
}

/** Narrow a picker selection to the type its mode expects. */
export function selectionIsAgent(selection: ContactPickerSelection): boolean {
  return selection.contact.type === 'agent' || selection.contact.type === 'asset_agent';
}
