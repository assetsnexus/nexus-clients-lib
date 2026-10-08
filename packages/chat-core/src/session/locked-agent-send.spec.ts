import { describe, expect, it, vi } from 'vitest';
import {
  LOCKED_AGENT_SEND_CONVERSATION,
  LOCKED_AGENT_SEND_ROOM,
  LOCKED_AGENT_SEND_UNKNOWN,
  decideLockedAgentSend,
  guardLockedAgentChannel,
  resolveLockedAgentSendTarget,
  type ConversationAgentNote,
} from './locked-agent-send.js';

const LOCKED = 've-locked';

function note(partial: Partial<ConversationAgentNote> & { conversationId: string }): ConversationAgentNote {
  return {
    virtualEmployeeId: null,
    agentId: null,
    contactId: null,
    ...partial,
  };
}

describe('decideLockedAgentSend', () => {
  it('allows an unlocked send to a room or an unknown conversation', () => {
    expect(
      decideLockedAgentSend({ locked: null, roomId: 'room-1', conversationId: 'c', known: null }).ok,
    ).toBe(true);
    expect(
      decideLockedAgentSend({ locked: null, conversationId: 'never', known: null }).ok,
    ).toBe(true);
  });

  it('refuses a room, another agent, and an unknown conversation when locked', () => {
    const room = decideLockedAgentSend({
      locked: { virtualEmployeeId: LOCKED },
      roomId: 'room-1',
      conversationId: 'mine',
      known: note({ conversationId: 'mine', virtualEmployeeId: LOCKED }),
    });
    expect(room).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_ROOM });

    const other = decideLockedAgentSend({
      locked: { virtualEmployeeId: LOCKED },
      conversationId: 'other',
      known: note({ conversationId: 'other', virtualEmployeeId: 've-other' }),
    });
    expect(other).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_CONVERSATION });

    const unknown = decideLockedAgentSend({
      locked: { virtualEmployeeId: LOCKED },
      conversationId: 'missing',
      known: null,
    });
    expect(unknown).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
  });

  it('allows the locked agent conversation and fails closed when only a sidecar agent id is known', () => {
    const allowed = decideLockedAgentSend({
      locked: { virtualEmployeeId: LOCKED },
      conversationId: 'mine',
      known: note({ conversationId: 'mine', virtualEmployeeId: LOCKED }),
    });
    expect(allowed).toEqual({ ok: true, conversationId: 'mine' });

    const sidecar = decideLockedAgentSend({
      locked: { virtualEmployeeId: LOCKED },
      conversationId: 'mine',
      known: note({ conversationId: 'mine', agentId: 'agent-sidecar' }),
    });
    expect(sidecar).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
  });
});

describe('guardLockedAgentChannel', () => {
  const known = note({ conversationId: 'mine', virtualEmployeeId: LOCKED });

  it('refuses a room, another agent, and an unknown conversation', () => {
    expect(
      guardLockedAgentChannel({
        locked: { virtualEmployeeId: LOCKED },
        roomId: 'room-1',
        conversationId: 'mine',
        known,
      }),
    ).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_ROOM });
    expect(
      guardLockedAgentChannel({
        locked: { virtualEmployeeId: LOCKED },
        conversationId: 'other',
        known: note({ conversationId: 'other', virtualEmployeeId: 've-other' }),
      }),
    ).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_CONVERSATION });
    expect(
      guardLockedAgentChannel({
        locked: { virtualEmployeeId: LOCKED },
        conversationId: 'missing',
        known: null,
        requireKnownConversation: true,
      }),
    ).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
  });

  it('allows the locked conversation and refuses a server id the client does not know', () => {
    expect(
      guardLockedAgentChannel({
        locked: { virtualEmployeeId: LOCKED },
        conversationId: 'mine',
        known,
        requireKnownConversation: true,
        adoptedConversationId: 'mine',
      }),
    ).toEqual({ ok: true, conversationId: 'mine' });
    expect(
      guardLockedAgentChannel({
        locked: { virtualEmployeeId: LOCKED },
        conversationId: 'mine',
        known,
        requireKnownConversation: true,
        adoptedConversationId: 'adopted-other',
      }),
    ).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN, conversationId: 'adopted-other' });
  });

  it('fails closed when a locked stream has no known conversation', () => {
    expect(
      guardLockedAgentChannel({
        locked: { virtualEmployeeId: LOCKED },
        known: null,
        requireKnownConversation: true,
      }),
    ).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
    expect(
      guardLockedAgentChannel({
        locked: null,
        roomId: 'room-1',
        known: null,
        requireKnownConversation: true,
      }).ok,
    ).toBe(true);
  });
});

describe('resolveLockedAgentSendTarget', () => {
  it('does not open a contact when the conversation or room is refused', async () => {
    const openContact = vi.fn(async () => ({ conversationId: 'created' }));
    const known = new Map<string, ConversationAgentNote>([
      ['mine', note({ conversationId: 'mine', virtualEmployeeId: LOCKED })],
      ['other', note({ conversationId: 'other', virtualEmployeeId: 've-other' })],
    ]);
    const lookup = (id: string) => known.get(id) || null;

    const other = await resolveLockedAgentSendTarget({
      locked: { virtualEmployeeId: LOCKED },
      conversationId: 'other',
      contactId: LOCKED,
      lookup,
      openContact,
    });
    const room = await resolveLockedAgentSendTarget({
      locked: { virtualEmployeeId: LOCKED },
      roomId: 'room-1',
      conversationId: 'mine',
      lookup,
      openContact,
    });

    expect(other).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_CONVERSATION });
    expect(room).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_ROOM });
    expect(openContact).not.toHaveBeenCalled();
  });

  it('opens the locked agent when no conversation is selected yet', async () => {
    const known = new Map<string, ConversationAgentNote>();
    const openContact = vi.fn(async () => {
      known.set('created-1', note({ conversationId: 'created-1', virtualEmployeeId: LOCKED }));
      return { conversationId: 'created-1' };
    });
    const result = await resolveLockedAgentSendTarget({
      locked: { virtualEmployeeId: LOCKED },
      contactId: LOCKED,
      contact: { id: LOCKED, virtualEmployeeId: LOCKED },
      lookup: (id) => known.get(id) || null,
      openContact,
    });
    expect(openContact).toHaveBeenCalledWith(LOCKED);
    expect(result).toEqual({ ok: true, conversationId: 'created-1' });
  });
});
