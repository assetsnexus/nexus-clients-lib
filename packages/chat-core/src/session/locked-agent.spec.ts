import { describe, expect, it } from 'vitest';
import { createNexusChat } from '../index.js';
import { filterConversationsForLockedAgent } from './locked-agent.js';

const LOCKED = 've-locked';

function conversations() {
  return [
    {
      conversationId: 'other',
      virtualEmployeeId: 've-other',
      status: 'active',
      lastActivityAt: '2026-06-01T00:00:00.000Z',
      title: 'Other agent',
    },
    {
      conversationId: 'mine',
      virtualEmployeeId: LOCKED,
      status: 'active',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      title: 'Locked agent',
    },
  ];
}

describe('filterConversationsForLockedAgent', () => {
  it('drops a conversation for a different agent', () => {
    const kept = filterConversationsForLockedAgent(conversations(), {
      virtualEmployeeId: LOCKED,
    });
    expect(kept.map((row) => row.conversationId)).toEqual(['mine']);
  });
});

describe('createNexusChat lockedAgent', () => {
  it('opens the existing conversation and drops other agents from the inbox list', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      lockedAgent: { virtualEmployeeId: LOCKED },
      client: {
        send: async (command, payload) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.conversations.list') {
            return { ok: true, data: { conversations: conversations() } };
          }
          if (command === 'anx.communicate.conversations.messages.list') {
            return {
              ok: true,
              data: { messages: [{ id: 'm1', role: 'assistant', content: 'hello' }] },
            };
          }
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { resourceId: 'mine', endpoints: [] } };
          }
          return { ok: true, data: {} };
        },
      },
    });

    const opened = await chat.whenLockedAgentReady;
    expect(opened).toEqual({ conversationId: 'mine', created: false });
    expect(sent.some((entry) => entry.command === 'anx.communicate.conversations.create')).toBe(
      false,
    );
    expect(sent.some((entry) => entry.command.includes('contacts'))).toBe(false);
    expect(sent.some((entry) => entry.command === 'anx.communicate.rooms.list')).toBe(false);
    expect(chat.getState().conversationId).toBe('mine');
    expect(chat.getState().selectedAgentId).toBe(LOCKED);
    expect(chat.getState().turns.some((turn) => turn.text === 'hello')).toBe(true);

    const listed = await chat.listConversations({ status: 'active', limit: 50 });
    expect(listed.map((row) => row.conversationId)).toEqual(['mine']);
    await expect(chat.loadContacts()).resolves.toBeUndefined();
    expect(sent.some((entry) => entry.command === 'anx.communicate.contacts.list')).toBe(false);
  });

  it('creates a conversation with the locked virtual employee id when none exists', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const chat = createNexusChat({
      lockedAgent: { virtualEmployeeId: LOCKED },
      client: {
        send: async (command, payload) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.conversations.list') {
            return {
              ok: true,
              data: {
                conversations: [
                  {
                    conversationId: 'other',
                    virtualEmployeeId: 've-other',
                    status: 'active',
                  },
                ],
              },
            };
          }
          if (command === 'anx.communicate.conversations.create') {
            return { ok: true, data: { conversationId: 'created-1', agentId: 'agent-sidecar' } };
          }
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { resourceId: 'created-1', endpoints: [] } };
          }
          return { ok: true, data: {} };
        },
      },
    });

    const opened = await chat.whenLockedAgentReady;
    expect(opened).toEqual({ conversationId: 'created-1', created: true });
    expect(sent.find((entry) => entry.command === 'anx.communicate.conversations.create')?.payload).toEqual({
      virtualEmployeeId: LOCKED,
    });
    const listed = await chat.listConversations({ status: 'active' });
    expect(listed.map((row) => row.conversationId)).toEqual([]);
  });
});
