import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURES,
  buildContactThreadIndex,
  historyForContact,
  createContactThreadApi,
  createNexusChat,
} from '../index.js';
import type { ChatContact } from '../types.js';

describe('DEFAULT_FEATURES.adminPanels', () => {
  it('defaults adminPanels to false', () => {
    expect(DEFAULT_FEATURES.adminPanels).toBe(false);
  });
});

describe('buildContactThreadIndex', () => {
  const contacts: ChatContact[] = [
    { id: 've-quiet', name: 'Quiet', type: 'agent', virtualEmployeeId: 've-quiet' },
    { id: 've-active', name: 'Active', type: 'agent', virtualEmployeeId: 've-active' },
    { id: 'user-1', name: 'Human', type: 'user' },
  ];

  it('sorts contacts with messages by lastActivityAt desc, then empty threads', () => {
    const conversations = [
      {
        conversationId: 'c-old',
        virtualEmployeeId: 've-active',
        lastActivityAt: '2026-01-01T10:00:00.000Z',
        status: 'active',
        unreadCount: 1,
        oneLineSummary: 'older',
      },
      {
        conversationId: 'c-new',
        virtualEmployeeId: 've-active',
        lastActivityAt: '2026-03-01T10:00:00.000Z',
        status: 'active',
        unreadCount: 2,
        oneLineSummary: 'newer',
      },
      {
        conversationId: 'c-human',
        peerUserId: 'user-1',
        lastActivityAt: '2026-02-01T10:00:00.000Z',
        status: 'active',
        messageCount: 3,
      },
    ];

    const index = buildContactThreadIndex(contacts, conversations);
    expect(index.map((e) => e.contactId)).toEqual(['ve-active', 'user-1', 've-quiet']);
    expect(index[0]).toMatchObject({
      contactId: 've-active',
      hasMessages: true,
      latestConversationId: 'c-new',
      unreadCount: 3,
    });
    expect(index[2]).toMatchObject({ contactId: 've-quiet', hasMessages: false });
  });
});

describe('historyForContact', () => {
  it('orders conversations newest first', () => {
    const rows = [
      { conversationId: 'a', virtualEmployeeId: 've-1', lastActivityAt: '2026-01-01T00:00:00.000Z' },
      { conversationId: 'b', virtualEmployeeId: 've-1', lastActivityAt: '2026-06-01T00:00:00.000Z' },
      { conversationId: 'c', virtualEmployeeId: 've-1', lastActivityAt: '2026-03-01T00:00:00.000Z' },
    ];
    expect(historyForContact(rows, 've-1').map((h) => h.conversationId)).toEqual(['b', 'c', 'a']);
  });
});

describe('createContactThreadApi', () => {
  it('openLatest reuses latest active conversation for the contact', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const api = createContactThreadApi({
      send: async (command, payload) => {
        sent.push({ command, payload });
        if (command === 'anx.communicate.conversations.list') {
          return {
            ok: true,
            data: {
              conversations: [
                {
                  conversationId: 'existing',
                  virtualEmployeeId: 've-1',
                  status: 'active',
                  lastActivityAt: '2026-01-02T00:00:00.000Z',
                },
                {
                  conversationId: 'older',
                  virtualEmployeeId: 've-1',
                  status: 'active',
                  lastActivityAt: '2026-01-01T00:00:00.000Z',
                },
              ],
            },
          };
        }
        return { ok: true, data: {} };
      },
    });

    const result = await api.openLatest({
      id: 've-1',
      name: 'Ada',
      type: 'agent',
      virtualEmployeeId: 've-1',
    });
    expect(result).toEqual({ conversationId: 'existing', created: false });
    expect(sent.some((e) => e.command === 'anx.communicate.conversations.create')).toBe(false);
  });

  it('openLatest creates when no active conversation exists', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const api = createContactThreadApi({
      send: async (command, payload) => {
        sent.push({ command, payload });
        if (command === 'anx.communicate.conversations.list') {
          return { ok: true, data: { conversations: [] } };
        }
        if (command === 'anx.communicate.conversations.create') {
          return { ok: true, data: { conversationId: 'new-conv', agentId: 'agent-1' } };
        }
        return { ok: true, data: {} };
      },
    });

    const result = await api.openLatest(
      { id: 've-1', name: 'Ada', type: 'agent', virtualEmployeeId: 've-1' },
      { title: '  Hello  ' },
    );
    expect(result).toEqual({ conversationId: 'new-conv', created: true });
    expect(sent.find((e) => e.command === 'anx.communicate.conversations.create')?.payload).toEqual({
      virtualEmployeeId: 've-1',
      title: '  Hello  ',
    });
    expect(sent.find((e) => e.command === 'anx.communicate.conversations.update')?.payload).toEqual({
      conversationId: 'new-conv',
      title: 'Hello',
    });
  });

  it('resetConversation archives current then creates a new conversation', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const api = createContactThreadApi({
      send: async (command, payload) => {
        sent.push({ command, payload });
        if (command === 'anx.communicate.conversations.create') {
          return { ok: true, data: { conversationId: 'fresh' } };
        }
        return { ok: true, data: {} };
      },
    });

    const result = await api.resetConversation(
      { id: 'peer-1', name: 'Bob', type: 'user' },
      'old-conv',
    );
    expect(result).toEqual({ conversationId: 'fresh', archivedId: 'old-conv' });
    expect(sent.find((e) => e.command === 'anx.communicate.conversations.update')?.payload).toEqual({
      conversationId: 'old-conv',
      status: 'archived',
    });
    expect(sent.find((e) => e.command === 'anx.communicate.conversations.create')?.payload).toEqual({
      agentId: 'peer-1',
    });
  });
});

describe('NexusChat.openLatest panel bind', () => {
  it('sets selectedAgentId and panel conversation after openLatest', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command) => {
          if (command === 'anx.communicate.conversations.list') {
            return {
              ok: true,
              data: {
                conversations: [
                  {
                    conversationId: 'bound-1',
                    virtualEmployeeId: 've-1',
                    status: 'active',
                    lastActivityAt: '2026-01-02T00:00:00.000Z',
                  },
                ],
              },
            };
          }
          return { ok: true, data: {} };
        },
      },
    });
    chat.getState().contacts.push({
      id: 've-1',
      name: 'Ada',
      type: 'agent',
      virtualEmployeeId: 've-1',
    });
    await chat.openLatest({
      id: 've-1',
      name: 'Ada',
      type: 'agent',
      virtualEmployeeId: 've-1',
    });
    const state = chat.getState();
    expect(state.selectedAgentId).toBe('ve-1');
    expect(state.conversationId).toBe('bound-1');
    expect(state.panels[state.activePanelIndex]?.contactId).toBe('ve-1');
    expect(state.panels[state.activePanelIndex]?.conversationId).toBe('bound-1');
  });
});
