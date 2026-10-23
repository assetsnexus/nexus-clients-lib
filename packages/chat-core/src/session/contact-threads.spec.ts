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

  it('openLatest creates when the locked list command is outside the app grant', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const api = createContactThreadApi(
      {
        send: async (command, payload) => {
          sent.push({ command, payload });
          if (command === 'anx.communicate.conversations.list') {
            return { ok: false, code: 'APP_COMMAND_FORBIDDEN', message: 'Command not allowed' };
          }
          if (command === 'anx.communicate.conversations.create') {
            return { ok: true, data: { conversationId: 'created-for-lock' } };
          }
          return { ok: true, data: {} };
        },
      },
      { lockedAgent: { virtualEmployeeId: 've-locked' } },
    );

    const result = await api.openLatest({
      id: 've-locked',
      name: 'Guide',
      type: 'agent',
      virtualEmployeeId: 've-locked',
    });
    expect(result).toEqual({ conversationId: 'created-for-lock', created: true });
    expect(sent.map((entry) => entry.command)).toEqual([
      'anx.communicate.conversations.list',
      'anx.communicate.conversations.create',
    ]);
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

describe('listConversations limit', () => {
  it('clamps a requested page above the inference maximum of 100', async () => {
    const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const api = createContactThreadApi({
      send: async (command, payload) => {
        sent.push({ command, payload });
        return { ok: true, data: { conversations: [] } };
      },
    });
    await api.listConversations({ status: 'active', limit: 200 });
    expect(sent[0]?.payload).toEqual({ status: 'active', limit: 100 });
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

describe('NexusChat.streamInit contact bind', () => {
  it('binds the owning agent contact when only a conversation id + contact id are known', async () => {
    // Regression: opening an agent DM from the region list arrives with only a
    // conversation id and the contact id (the list reports contactId: null and
    // only exposes virtualEmployeeId/agentId). streamInit must bind the panel so
    // the header resolves the agent — otherwise call / companion affordances hide.
    const chat = createNexusChat({
      client: {
        send: async (command) => {
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { resourceId: 'conv-9' } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    chat.getState().contacts.push({
      id: 've-nox',
      name: 'Nox',
      type: 'agent',
      virtualEmployeeId: 've-nox',
      aliases: ['alias-nox'],
    });

    // Panel starts unbound, mirroring a fresh app open.
    expect(chat.getState().panels[chat.getState().activePanelIndex]?.contactId).toBe('');

    await chat.streamInit({ conversationId: 'conv-9', contactId: 'alias-nox' });

    const state = chat.getState();
    const panel = state.panels[state.activePanelIndex];
    expect(panel?.contactId).toBe('ve-nox');
    expect(panel?.contactType).toBe('agent');
    expect(panel?.conversationId).toBe('conv-9');
    expect(state.selectedAgentId).toBe('ve-nox');
    expect(state.conversationId).toBe('conv-9');
  });

  it('does not overwrite an existing contact binding when streamInit omits contactId', async () => {
    const chat = createNexusChat({
      client: {
        send: async (command) => {
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { resourceId: 'conv-10' } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    chat.getState().contacts.push({ id: 've-a', name: 'A', type: 'agent', virtualEmployeeId: 've-a' });
    await chat.streamInit({ conversationId: 'conv-1', contactId: 've-a' });

    await chat.streamInit({ conversationId: 'conv-10' });

    const state = chat.getState();
    expect(state.panels[state.activePanelIndex]?.contactId).toBe('ve-a');
    expect(state.panels[state.activePanelIndex]?.conversationId).toBe('conv-10');
  });
});
