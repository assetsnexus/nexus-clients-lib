import { describe, expect, it } from 'vitest';
import {
  LOCKED_AGENT_SEND_CONVERSATION,
  LOCKED_AGENT_SEND_ROOM,
  LOCKED_AGENT_SEND_UNKNOWN,
  createNexusChat,
} from '../index.js';
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

  it('sends to the locked agent conversation and refuses other threads and rooms', async () => {
    const body = 'do-not-log-this-body';
    const { chat, sent, logs } = sendHarness({ locked: true });
    await chat.whenLockedAgentReady;

    const allowed = await chat.sendMessage('hello locked', { conversationId: 'mine' });
    expect(allowed.ok).toBe(true);
    expect(sent.some((entry) => entry.command === 'anx.communicate.message.send' && entry.payload?.conversationId === 'mine')).toBe(true);

    const beforeOther = sent.length;
    const other = await chat.sendMessage(body, { conversationId: 'other' });
    expect(other).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_CONVERSATION });
    expect(sent.slice(beforeOther).some((entry) => entry.command.includes('message.send'))).toBe(false);
    expect(chat.getState().turns.some((turn) => turn.text === body)).toBe(false);

    const beforeRoom = sent.length;
    const room = await chat.sendMessage(body, { roomId: 'room-9', conversationId: 'mine' });
    expect(room).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_ROOM });
    expect(sent.slice(beforeRoom).some((entry) => entry.command.includes('message.send') || entry.command === 'anx.communicate.stream-init')).toBe(false);

    const beforeUnknown = sent.length;
    const unknown = await chat.sendMessage(body, { conversationId: 'never-listed' });
    expect(unknown).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
    expect(sent.slice(beforeUnknown).some((entry) => entry.command.includes('message.send'))).toBe(false);

    expect(JSON.stringify(logs)).not.toContain(body);
    expect(sent.some((entry) => JSON.stringify(entry.payload || {}).includes(body))).toBe(false);
  });

  it('sends on a conversation created for the locked agent', async () => {
    const { chat, sent } = sendHarness({
      locked: true,
      conversations: [
        {
          conversationId: 'other',
          virtualEmployeeId: 've-other',
          status: 'active',
        },
      ],
    });
    const opened = await chat.whenLockedAgentReady;
    expect(opened).toEqual({ conversationId: 'created-1', created: true });
    const result = await chat.sendMessage('hello created', { conversationId: 'created-1' });
    expect(result.ok).toBe(true);
    expect(
      sent.find((entry) => entry.command === 'anx.communicate.message.send')?.payload,
    ).toMatchObject({ conversationId: 'created-1', text: 'hello created' });
  });

  it('still sends to any conversation or room when the chat is unlocked', async () => {
    const { chat, sent } = sendHarness({ locked: false });
    const direct = await chat.sendMessage('ping', { conversationId: 'other' });
    expect(direct.ok).toBe(true);
    const room = await chat.sendMessage('room ping', { roomId: 'room-9' });
    expect(room.ok).toBe(true);
    expect(sent.find((entry) => entry.command === 'anx.communicate.message.send')?.payload).toMatchObject({
      conversationId: 'other',
      text: 'ping',
    });
    expect(sent.find((entry) => entry.command === 'anx.communicate.rooms.message.send')?.payload).toMatchObject({
      roomId: 'room-9',
      text: 'room ping',
    });
  });
});

function sendHarness(input: {
  locked: boolean;
  conversations?: ReturnType<typeof conversations>;
}) {
  const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
  const logs: Array<{ event: string; extra?: unknown }> = [];
  const rows = input.conversations || conversations();
  const chat = createNexusChat({
    ...(input.locked ? { lockedAgent: { virtualEmployeeId: LOCKED } } : {}),
    replyPoll: { intervalMs: 0, maxAttempts: 1 },
    logger: {
      warn: (event: string, extra?: unknown) => {
        logs.push({ event: String(event), extra });
      },
    },
    client: {
      send: async (command, payload) => {
        sent.push({ command, payload });
        if (command === 'anx.communicate.conversations.list') {
          return { ok: true, data: { conversations: rows } };
        }
        if (command === 'anx.communicate.conversations.create') {
          return { ok: true, data: { conversationId: 'created-1', agentId: 'agent-sidecar' } };
        }
        if (command === 'anx.communicate.stream-init') {
          return {
            ok: true,
            data: { resourceId: payload?.conversationId || payload?.roomId || 'mine', endpoints: [] },
          };
        }
        if (
          command === 'anx.communicate.message.send' ||
          command === 'anx.communicate.rooms.message.send'
        ) {
          return { ok: true, data: { text: 'ok', conversationId: payload?.conversationId || null } };
        }
        if (command === 'anx.communicate.conversations.messages.list') {
          return { ok: true, data: { messages: [] } };
        }
        return { ok: true, data: {} };
      },
    },
  });
  return { chat, sent, logs };
}
