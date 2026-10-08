import { conversationBelongsToContact, conversationIdFromRow, type ConversationRow } from './contact-threads.js';
import { lockedAgentAllowsContact, lockedAgentContact, type LockedAgent } from './locked-agent.js';

/** `sendMessage` included a room while the embed is locked to one agent. */
export const LOCKED_AGENT_SEND_ROOM = 'locked_agent_room';
/** `sendMessage` targeted a conversation that belongs to a different agent. */
export const LOCKED_AGENT_SEND_CONVERSATION = 'locked_agent_conversation';
/**
 * The client has no inbox row or conversation record that identifies the
 * conversation's agent. Fail closed — do not post.
 */
export const LOCKED_AGENT_SEND_UNKNOWN = 'locked_agent_unknown_conversation';

export type ConversationAgentNote = {
  conversationId: string;
  virtualEmployeeId: string | null;
  agentId: string | null;
  contactId: string | null;
};

export type LockedAgentSendDecision =
  | { ok: true; conversationId?: string }
  | {
      ok: false;
      code: string;
      message: string;
      conversationId?: string | null;
      roomId?: string | null;
    };

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function lockedMessage(locked: LockedAgent): string {
  return `Chat is locked to agent ${locked.virtualEmployeeId}`;
}

/**
 * Agent identity already present on a conversations.list row or inbox record.
 * Does not fetch. Empty identity fields stay null so send can fail closed.
 */
export function conversationAgentNoteFromRow(row: ConversationRow): ConversationAgentNote | null {
  const conversationId = conversationIdFromRow(row);
  if (!conversationId) return null;
  return {
    conversationId,
    virtualEmployeeId:
      clean(row.virtualEmployeeId) || clean(row.anxVeId) || clean(row.virtualAgentId),
    agentId: clean(row.agentId),
    contactId: clean(row.contactId) || clean(row.peerUserId),
  };
}

export function conversationAgentNotesFromRows(rows: ConversationRow[] | null | undefined): ConversationAgentNote[] {
  const notes: ConversationAgentNote[] = [];
  for (const row of rows || []) {
    const note = conversationAgentNoteFromRow(row);
    if (note) notes.push(note);
  }
  return notes;
}

/** Record a conversation this client just created or opened for a contact. */
export function conversationAgentNoteFromContact(
  conversationId: string,
  contact: {
    id?: string | null;
    type?: string | null;
    virtualEmployeeId?: string | null;
    agentId?: string | null;
  },
): ConversationAgentNote | null {
  const id = clean(conversationId);
  if (!id) return null;
  const virtualEmployeeId =
    clean(contact.virtualEmployeeId) || (contact.type === 'agent' ? clean(contact.id) : null);
  return {
    conversationId: id,
    virtualEmployeeId,
    agentId: clean(contact.agentId),
    contactId: clean(contact.id),
  };
}

function prefer(incoming: string | null, previous: string | null | undefined): string | null {
  return incoming || previous || null;
}

/** Conversations this client has already listed, opened, or created. */
export class ConversationAgentIndex {
  private readonly byId = new Map<string, ConversationAgentNote>();

  remember(note: ConversationAgentNote | null | undefined): void {
    if (!note) return;
    const conversationId = clean(note.conversationId);
    if (!conversationId) return;
    const prev = this.byId.get(conversationId);
    this.byId.set(conversationId, {
      conversationId,
      virtualEmployeeId: prefer(clean(note.virtualEmployeeId), prev?.virtualEmployeeId),
      agentId: prefer(clean(note.agentId), prev?.agentId),
      contactId: prefer(clean(note.contactId), prev?.contactId),
    });
  }

  rememberAll(notes: ConversationAgentNote[] | null | undefined): void {
    for (const note of notes || []) this.remember(note);
  }

  get(conversationId: string | null | undefined): ConversationAgentNote | null {
    const id = clean(conversationId);
    if (!id) return null;
    return this.byId.get(id) || null;
  }
}

function noteMatchesLockedAgent(note: ConversationAgentNote, locked: LockedAgent): boolean {
  return conversationBelongsToContact(
    {
      conversationId: note.conversationId,
      virtualEmployeeId: note.virtualEmployeeId,
      agentId: note.agentId,
      contactId: note.contactId,
    },
    locked.virtualEmployeeId,
    lockedAgentContact(locked),
  );
}

/**
 * Locked embeds may post only to a conversation already known to be with that
 * virtual employee. Rooms are refused. An unresolved agent fails closed.
 * An unlocked chat (`locked == null`) is unchanged.
 */
export function decideLockedAgentSend(input: {
  locked: LockedAgent | null;
  roomId?: string | null;
  conversationId?: string | null;
  known: ConversationAgentNote | null;
}): LockedAgentSendDecision {
  if (!input.locked) return { ok: true, conversationId: clean(input.conversationId) || undefined };
  const roomId = clean(input.roomId);
  if (roomId) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_ROOM,
      message: `${lockedMessage(input.locked)} and cannot post to a room`,
      roomId,
      conversationId: clean(input.conversationId),
    };
  }
  const conversationId = clean(input.conversationId);
  if (!conversationId) return { ok: true };
  const known = input.known && input.known.conversationId === conversationId ? input.known : null;
  if (!known) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_UNKNOWN,
      message: `${lockedMessage(input.locked)}; the conversation agent is unknown`,
      conversationId,
    };
  }
  if (noteMatchesLockedAgent(known, input.locked)) {
    return { ok: true, conversationId };
  }
  if (known.virtualEmployeeId || known.contactId) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_CONVERSATION,
      message: lockedMessage(input.locked),
      conversationId,
    };
  }
  return {
    ok: false,
    code: LOCKED_AGENT_SEND_UNKNOWN,
    message: `${lockedMessage(input.locked)}; the conversation agent is unknown`,
    conversationId,
  };
}

/**
 * Shared lock for send, room send, stream-init, and client-tool resume.
 * Rooms are refused. A conversation is allowed only when this client already
 * knows it belongs to the locked virtual employee. Unknown identity fails
 * closed. An unlocked chat is unchanged.
 *
 * `requireKnownConversation` is for stream-init and client-tool resume: with
 * no conversation they would post and then store a server-chosen id.
 * sendMessage leaves it unset so the locked agent can still be opened.
 * `adoptedConversationId` is the id stream-init returned; a different id is
 * not a known agent and must not be written into the store.
 */
export function guardLockedAgentChannel(input: {
  locked: LockedAgent | null;
  roomId?: string | null;
  conversationId?: string | null;
  known: ConversationAgentNote | null;
  requireKnownConversation?: boolean;
  adoptedConversationId?: string | null;
}): LockedAgentSendDecision {
  const decision = decideLockedAgentSend({
    locked: input.locked,
    roomId: input.roomId,
    conversationId: input.conversationId,
    known: input.known,
  });
  if (!input.locked) return decision;
  if (!decision.ok) return decision;
  const adopted = clean(input.adoptedConversationId);
  const authorized = decision.conversationId || clean(input.conversationId);
  if (adopted && adopted !== authorized) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_UNKNOWN,
      message: `${lockedMessage(input.locked)}; the conversation agent is unknown`,
      conversationId: adopted,
    };
  }
  if (input.requireKnownConversation && !decision.conversationId) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_UNKNOWN,
      message: `${lockedMessage(input.locked)}; the conversation agent is unknown`,
      conversationId: clean(input.conversationId),
    };
  }
  return decision;
}

/**
 * After `anx.communicate.message.send`, a locked client may store the returned
 * conversation id only when this client already knows it belongs to the locked
 * agent, or when this send just created that agent's conversation and the
 * returned id is that new one. Any other id fails closed. An unlocked chat is
 * unchanged.
 */
export function acceptLockedAgentSendConversation(input: {
  locked: LockedAgent | null;
  returnedConversationId?: string | null;
  known: ConversationAgentNote | null;
  createdConversationId?: string | null;
}): LockedAgentSendDecision {
  const returned = clean(input.returnedConversationId);
  if (!input.locked) return { ok: true, conversationId: returned || undefined };
  const known =
    input.known && input.known.conversationId === returned ? input.known : null;
  const decision = guardLockedAgentChannel({
    locked: input.locked,
    conversationId: returned,
    known,
  });
  if (decision.ok && decision.conversationId) return decision;
  const created = clean(input.createdConversationId);
  if (
    returned &&
    created &&
    returned === created &&
    !decision.ok &&
    decision.code === LOCKED_AGENT_SEND_UNKNOWN
  ) {
    return { ok: true, conversationId: returned };
  }
  return decision;
}

/**
 * Resolve a locked send against known conversation records.
 * Opens the locked agent only when the caller did not name a conversation or room.
 */
export async function resolveLockedAgentSendTarget(input: {
  locked: LockedAgent | null;
  conversationId?: string | null;
  contactId?: string | null;
  roomId?: string | null;
  contact?: { id?: string | null; virtualEmployeeId?: string | null; agentId?: string | null } | null;
  lookup: (conversationId: string) => ConversationAgentNote | null;
  openContact?: (contactId: string) => Promise<{ conversationId?: string | null }>;
}): Promise<LockedAgentSendDecision> {
  const first = guardLockedAgentChannel({
    locked: input.locked,
    roomId: input.roomId,
    conversationId: input.conversationId,
    known: input.lookup(String(input.conversationId || '')),
  });
  if (!input.locked) return first;
  if (!first.ok) return first;
  if (first.conversationId) return first;

  const contactId = clean(input.contactId);
  if (!contactId) return first;
  const contact = input.contact;
  if (
    !lockedAgentAllowsContact(input.locked, {
      id: contactId,
      virtualEmployeeId: contact?.virtualEmployeeId || contactId,
      agentId: contact?.agentId,
    })
  ) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_CONVERSATION,
      message: lockedMessage(input.locked),
      conversationId: null,
    };
  }
  if (!input.openContact) {
    return {
      ok: false,
      code: LOCKED_AGENT_SEND_UNKNOWN,
      message: `${lockedMessage(input.locked)}; the conversation agent is unknown`,
      conversationId: null,
    };
  }
  const opened = await input.openContact(contactId);
  const conversationId = clean(opened?.conversationId);
  return guardLockedAgentChannel({
    locked: input.locked,
    conversationId,
    known: conversationId ? input.lookup(conversationId) : null,
    requireKnownConversation: true,
  });
}
