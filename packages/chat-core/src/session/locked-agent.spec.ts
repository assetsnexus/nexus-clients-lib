import { describe, expect, it } from 'vitest';
import {
  LOCKED_AGENT_SEND_CONVERSATION,
  LOCKED_AGENT_SEND_ROOM,
  LOCKED_AGENT_SEND_UNKNOWN,
  createNexusChat,
  lockedAgentVisibleName,
  parseLockedAgent,
  threadEmptyLabel,
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

describe('locked agent labels', () => {
  it('shows the host name and never the raw id', () => {
    expect(parseLockedAgent({ virtualEmployeeId: LOCKED, displayName: ' Guide ' })).toEqual({
      virtualEmployeeId: LOCKED,
      displayName: 'Guide',
    });
    expect(parseLockedAgent({ virtualEmployeeId: LOCKED, displayName: LOCKED })).toEqual({
      virtualEmployeeId: LOCKED,
    });
    expect(lockedAgentVisibleName({ virtualEmployeeId: LOCKED, displayName: 'Guide' }, LOCKED)).toBe('Guide');
    expect(lockedAgentVisibleName({ virtualEmployeeId: LOCKED, displayName: 'Guide' }, 'Server Name')).toBe('Guide');
    expect(lockedAgentVisibleName({ virtualEmployeeId: LOCKED }, 'Server Name')).toBe('Server Name');
    expect(parseLockedAgent({ virtualEmployeeId: LOCKED, displayName: 'Guide', avatarUrl: '  ' })).toEqual({
      virtualEmployeeId: LOCKED,
      displayName: 'Guide',
    });
    expect(
      parseLockedAgent({ virtualEmployeeId: LOCKED, displayName: 'Guide', avatarUrl: 'https://cdn.example/a.png' })
        .avatarUrl,
    ).toBe('https://cdn.example/a.png');
    expect(lockedAgentVisibleName({ virtualEmployeeId: LOCKED })).toBe('Agent');
    expect(threadEmptyLabel({ lockedAgent: { virtualEmployeeId: LOCKED }, contactSelected: true })).toBe(
      'Send a message to start.',
    );
    expect(threadEmptyLabel({ lockedAgent: null, contactSelected: false })).toBe(
      'Select a contact to start chatting.',
    );
  });
});

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

  it('keeps the host display name until the server agent name arrives, and reports grant failures', async () => {
    const chat = createNexusChat({
      lockedAgent: { virtualEmployeeId: LOCKED, displayName: 'Guide' },
      client: {
        send: async (command) => {
          if (command === 'anx.communicate.conversations.list') {
            return {
              ok: true,
              data: {
                conversations: [
                  {
                    conversationId: 'mine',
                    virtualEmployeeId: LOCKED,
                    status: 'active',
                    lastActivityAt: '2026-06-01T00:00:00.000Z',
                    agentName: 'Guide',
                  },
                ],
              },
            };
          }
          if (command === 'anx.communicate.conversations.messages.list') {
            return { ok: true, data: { messages: [] } };
          }
          if (command === 'anx.communicate.stream-init') {
            return { ok: true, data: { resourceId: 'mine', endpoints: [] } };
          }
          return { ok: true, data: {} };
        },
      },
    });
    expect(chat.getState().contacts[0]?.name).toBe('Guide');
    expect(chat.getState().contacts[0]?.name).not.toBe(LOCKED);
    await chat.whenLockedAgentReady;
    expect(chat.getState().contacts[0]?.name).toBe('Guide');

    const denied = createNexusChat({
      lockedAgent: { virtualEmployeeId: LOCKED, displayName: 'Guide' },
      client: {
        send: async () => ({
          ok: false,
          code: 'NO_NEXUS_GRANT',
          message: 'Sign in with Nexus to chat.',
        }),
      },
    });
    await expect(denied.whenLockedAgentReady).rejects.toMatchObject({
      message: 'Sign in with Nexus to chat.',
      code: 'NO_NEXUS_GRANT',
    });
    expect(denied.getState().contacts[0]?.name).toBe('Guide');
  });

  it('surfaces NO_NEXUS_GRANT when a locked send must open a conversation', async () => {
    const errors: unknown[] = [];
    const chat = createNexusChat({
      lockedAgent: { virtualEmployeeId: LOCKED, displayName: 'Guide' },
      hooks: {
        onError: (err) => {
          errors.push(err);
        },
      },
      client: {
        send: async (command) => {
          if (command === 'anx.communicate.conversations.list') {
            return { ok: true, data: { conversations: [] } };
          }
          if (command === 'anx.communicate.conversations.create') {
            return { ok: false, code: 'NO_NEXUS_GRANT', message: 'Sign in with Nexus to chat.' };
          }
          return { ok: true, data: {} };
        },
      },
    });
    await expect(chat.whenLockedAgentReady).rejects.toMatchObject({ code: 'NO_NEXUS_GRANT' });
    const beforeSend = errors.length;
    const result = await chat.sendMessage('hello locked');
    expect(result).toMatchObject({
      ok: false,
      code: 'NO_NEXUS_GRANT',
      message: 'Sign in with Nexus to chat.',
    });
    expect(errors.length).toBe(beforeSend + 1);
    expect(errors[beforeSend]).toBeInstanceOf(Error);
    expect(errors[beforeSend]).toMatchObject({
      message: 'Sign in with Nexus to chat.',
      code: 'NO_NEXUS_GRANT',
    });
    expect(chat.getState().contacts[0]?.name).toBe('Guide');
    expect(chat.getState().contacts[0]?.name).not.toBe(LOCKED);
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

  it('refuses room send, foreign resume, and foreign stream-init, and still opens the locked agent', async () => {
    const body = 'do-not-log-this-body';
    const { chat, sent, logs } = sendHarness({ locked: true });
    await chat.whenLockedAgentReady;
    const conversationBefore = chat.getState().conversationId;
    expect(conversationBefore).toBe('mine');

    const beforeRoom = sent.length;
    const room = await chat.sendRoomMessage('room-9', body);
    expect(room).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_ROOM });
    expect(sent.slice(beforeRoom).some((entry) => entry.command === 'anx.communicate.rooms.message.send')).toBe(false);

    const turnsBefore = chat.getState().turns.map((turn) => turn.id);
    const beforeResume = sent.length;
    const otherResume = await chat.resumeClientTool({
      callId: 'call-other',
      conversationId: 'other',
      result: { secret: body },
    });
    expect(otherResume).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_CONVERSATION });
    const unknownResume = await chat.resumeClientTool({
      callId: 'call-unknown',
      conversationId: 'never-listed',
      result: { secret: body },
    });
    expect(unknownResume).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
    expect(
      sent.slice(beforeResume).some(
        (entry) =>
          entry.command === 'anx.communicate.client-tool.result' ||
          entry.command === 'anx.communicate.stream-init',
      ),
    ).toBe(false);
    expect(chat.getState().turns.map((turn) => turn.id)).toEqual(turnsBefore);
    expect(chat.getState().streaming).toBe(false);

    const beforeStream = sent.length;
    await expect(chat.streamInit({ roomId: 'room-9' })).rejects.toThrow(/cannot post to a room/);
    await expect(chat.streamInit({ conversationId: 'other' })).rejects.toThrow(
      /^Chat is locked to agent ve-locked$/,
    );
    await expect(chat.streamInit({ conversationId: 'never-listed' })).rejects.toThrow(/unknown/);
    await expect(chat.streamInit({ contactId: 've-other' })).rejects.toThrow(/unknown/);
    expect(sent.slice(beforeStream).some((entry) => entry.command === 'anx.communicate.stream-init')).toBe(false);
    expect(chat.getState().conversationId).toBe('mine');

    const allowedStream = sent.length;
    await chat.streamInit({ conversationId: 'mine', contactId: LOCKED });
    expect(sent.slice(allowedStream).some((entry) => entry.command === 'anx.communicate.stream-init' && entry.payload?.conversationId === 'mine')).toBe(true);
    expect(chat.getState().conversationId).toBe('mine');

    const allowedResume = sent.length;
    const resumed = await chat.resumeClientTool({
      callId: 'call-mine',
      conversationId: 'mine',
      result: { status: 'done' },
    });
    expect(resumed.ok).toBe(true);
    expect(sent.slice(allowedResume).some((entry) => entry.command === 'anx.communicate.client-tool.result' && entry.payload?.conversationId === 'mine')).toBe(true);
    expect(sent.slice(allowedResume).some((entry) => entry.command === 'anx.communicate.stream-init' && entry.payload?.conversationId === 'mine')).toBe(true);

    expect(JSON.stringify(logs)).not.toContain(body);
    expect(sent.some((entry) => JSON.stringify(entry.payload || {}).includes(body))).toBe(false);
  });

  it('does not store a stream-init conversation id outside the locked agent', async () => {
    let hijackResource = false;
    const { chat, sent } = sendHarness({
      locked: true,
      streamResourceId: () => (hijackResource ? 'adopted-other' : null),
    });
    await chat.whenLockedAgentReady;
    expect(chat.getState().conversationId).toBe('mine');
    hijackResource = true;
    const before = sent.length;
    await expect(chat.streamInit({ conversationId: 'mine' })).rejects.toThrow(/unknown/);
    expect(sent.slice(before).some((entry) => entry.command === 'anx.communicate.stream-init' && entry.payload?.conversationId === 'mine')).toBe(true);
    expect(chat.getState().conversationId).toBe('mine');
    expect(JSON.stringify(chat.getState())).not.toContain('adopted-other');
  });

  it('does not adopt a message.send conversation id outside the locked agent', async () => {
    const body = 'do-not-log-this-body';
    const reply = 'foreign-reply-not-stored';
    let returned = 'mine';
    let replyText = 'ok';
    const { chat, sent, logs } = sendHarness({
      locked: true,
      messageSendConversationId: () => returned,
      messageReplyText: () => replyText,
    });
    await chat.whenLockedAgentReady;
    expect(chat.getState().conversationId).toBe('mine');

    const allowed = await chat.sendMessage('hello locked', { conversationId: 'mine' });
    expect(allowed.ok).toBe(true);
    expect(chat.getState().conversationId).toBe('mine');
    expect(panelOf(chat).conversationId).toBe('mine');

    returned = 'adopted-other';
    replyText = reply;
    const before = sent.length;
    const hijack = await chat.sendMessage(body, { conversationId: 'mine' });
    expect(hijack).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
    expect(
      sent.slice(before).some(
        (entry) =>
          entry.command === 'anx.communicate.message.send' && entry.payload?.conversationId === 'mine',
      ),
    ).toBe(true);
    expect(
      sent.some(
        (entry) =>
          entry.command === 'anx.communicate.conversations.messages.list' &&
          entry.payload?.conversationId === 'adopted-other',
      ),
    ).toBe(false);
    expect(chat.getState().conversationId).toBe('mine');
    expect(panelOf(chat)).toMatchObject({
      conversationId: 'mine',
      roomId: null,
      roomPurpose: 'conversation',
    });
    expect(chat.getState().streaming).toBe(false);
    expect(JSON.stringify(chat.getState())).not.toContain('adopted-other');
    expect(JSON.stringify(chat.getState())).not.toContain(reply);
    expect(JSON.stringify(logs)).not.toContain(body);
    expect(JSON.stringify(logs)).not.toContain(reply);

    returned = 'other';
    const other = await chat.sendMessage('hello locked', { conversationId: 'mine' });
    expect(other).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_CONVERSATION });
    expect(chat.getState().conversationId).toBe('mine');
    expect(panelOf(chat).conversationId).toBe('mine');
  });

  it('does not adopt a conversation id returned by a raw-model send while locked', async () => {
    const { chat, sent } = sendHarness({
      locked: true,
      agentSource: 'raw_models',
      messageSendConversationId: () => 'adopted-other',
    });
    await chat.whenLockedAgentReady;
    expect(chat.getState().conversationId).toBe('mine');
    const before = sent.length;
    const hijack = await chat.sendMessage('hello locked', {
      conversationId: 'mine',
      attachments: [
        {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: 'file-foreign',
          mimeType: 'image/png',
          filename: 'shot.png',
        },
      ],
    });
    expect(hijack).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
    expect(
      sent.slice(before).some(
        (entry) =>
          entry.command === 'anx.inference.chat.completions' &&
          entry.payload?.conversationId === 'mine',
      ),
    ).toBe(true);
    expect(
      sent.slice(before).some((entry) => entry.command === 'anx.workspace.items.add'),
    ).toBe(false);
    expect(chat.getState().conversationId).toBe('mine');
    expect(panelOf(chat)).toMatchObject({
      conversationId: 'mine',
      roomId: null,
      roomPurpose: 'conversation',
    });
    expect(JSON.stringify(chat.getState())).not.toContain('adopted-other');
  });

  it('still stores a raw-model conversation id and links attachments when unlocked', async () => {
    const { chat, sent } = sendHarness({
      locked: false,
      agentSource: 'raw_models',
      messageSendConversationId: () => 'server-new',
    });
    const direct = await chat.sendMessage('ping', {
      conversationId: 'other',
      attachments: [
        {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: 'file-1',
          mimeType: 'image/png',
        },
      ],
    });
    expect(direct.ok).toBe(true);
    expect(
      sent.some((entry) => entry.command === 'anx.inference.chat.completions'),
    ).toBe(true);
    expect(chat.getState().conversationId).toBe('server-new');
    expect(panelOf(chat).conversationId).toBe('server-new');
    expect(
      sent.some(
        (entry) =>
          entry.command === 'anx.workspace.items.add' &&
          entry.payload?.conversationId === 'server-new' &&
          entry.payload?.fileId === 'file-1',
      ),
    ).toBe(true);
  });

  it('adopts a returned conversation id already known to belong to the locked agent', async () => {
    const { chat } = sendHarness({
      locked: true,
      conversations: [
        ...conversations(),
        {
          conversationId: 'mine-2',
          virtualEmployeeId: LOCKED,
          status: 'active',
          lastActivityAt: '2025-01-01T00:00:00.000Z',
          title: 'Older locked thread',
        },
      ],
      messageSendConversationId: () => 'mine-2',
    });
    await chat.whenLockedAgentReady;
    expect(chat.getState().conversationId).toBe('mine');

    const result = await chat.sendMessage('hello locked', { conversationId: 'mine' });
    expect(result.ok).toBe(true);
    expect(chat.getState().conversationId).toBe('mine-2');
    expect(panelOf(chat)).toMatchObject({
      conversationId: 'mine-2',
      roomId: null,
      roomPurpose: 'conversation',
    });
  });

  it('adopts the conversation this send created and refuses a different server id', async () => {
    let returned = 'created-1';
    const { chat } = sendHarness({
      locked: true,
      conversations: [
        {
          conversationId: 'other',
          virtualEmployeeId: 've-other',
          status: 'active',
        },
      ],
      messageSendConversationId: () => returned,
    });
    const opened = await chat.whenLockedAgentReady;
    expect(opened).toEqual({ conversationId: 'created-1', created: true });

    const created = await chat.sendMessage('hello created');
    expect(created.ok).toBe(true);
    expect(chat.getState().conversationId).toBe('created-1');
    expect(panelOf(chat).conversationId).toBe('created-1');

    returned = 'adopted-other';
    const hijack = await chat.sendMessage('hello created again');
    expect(hijack).toMatchObject({ ok: false, code: LOCKED_AGENT_SEND_UNKNOWN });
    expect(chat.getState().conversationId).toBe('created-1');
    expect(panelOf(chat).conversationId).toBe('created-1');
    expect(JSON.stringify(chat.getState())).not.toContain('adopted-other');
  });

  it('rehydrateTurns does not switch a locked chat to a room or an unknown conversation', async () => {
    const body = 'do-not-log-this-body';
    const { chat, logs } = sendHarness({
      locked: true,
      conversations: [
        ...conversations(),
        {
          conversationId: 'mine-2',
          virtualEmployeeId: LOCKED,
          status: 'active',
          lastActivityAt: '2025-01-01T00:00:00.000Z',
          title: 'Older locked thread',
        },
      ],
    });
    await chat.whenLockedAgentReady;
    expect(chat.getState().conversationId).toBe('mine');
    chat.rehydrateTurns([{ id: 'seed', role: 'assistant', content: 'seed-hello' }], {
      conversationId: 'mine',
    });
    expect(chat.getState().turns.some((turn) => turn.text === 'seed-hello')).toBe(true);

    chat.rehydrateTurns([{ id: 'x', role: 'user', content: body }], { conversationId: 'other' });
    chat.rehydrateTurns([{ id: 'y', role: 'user', content: body }], { conversationId: 'never-listed' });
    chat.rehydrateTurns([{ id: 'z', role: 'user', content: body }], { roomId: 'room-9', conversationId: 'mine' });
    chat.rehydrateTurns([{ id: 'n', role: 'user', content: body }], { conversationId: null });

    expect(chat.getState().conversationId).toBe('mine');
    expect(panelOf(chat)).toMatchObject({
      conversationId: 'mine',
      roomId: null,
      roomPurpose: 'conversation',
    });
    expect(chat.getState().turns.some((turn) => turn.text === 'seed-hello')).toBe(true);
    expect(chat.getState().turns.some((turn) => turn.text === body)).toBe(false);
    expect(JSON.stringify(chat.getState())).not.toContain('room-9');
    expect(JSON.stringify(chat.getState())).not.toContain('never-listed');
    expect(JSON.stringify(logs)).not.toContain(body);

    chat.rehydrateTurns([{ id: 'kept', role: 'user', content: 'still-mine' }]);
    expect(chat.getState().conversationId).toBe('mine');
    expect(chat.getState().turns.some((turn) => turn.text === 'still-mine')).toBe(true);

    chat.rehydrateTurns([{ id: 'mine-row', role: 'assistant', content: 'known thread' }], {
      conversationId: 'mine',
      detachStream: true,
    });
    expect(chat.getState().conversationId).toBe('mine');
    expect(panelOf(chat).conversationId).toBe('mine');
    expect(chat.getState().turns.map((turn) => turn.text)).toEqual(['known thread']);

    chat.rehydrateTurns([{ id: 'older', role: 'assistant', content: 'older thread' }], {
      conversationId: 'mine-2',
    });
    expect(chat.getState().conversationId).toBe('mine-2');
    expect(panelOf(chat)).toMatchObject({
      conversationId: 'mine-2',
      roomId: null,
      roomPurpose: 'conversation',
    });
    expect(chat.getState().turns.map((turn) => turn.text)).toEqual(['older thread']);
  });

  it('rehydrateTurns still switches room and conversation when the chat is unlocked', async () => {
    const { chat } = sendHarness({ locked: false });
    chat.rehydrateTurns([{ id: 'u', role: 'user', content: 'room-body' }], {
      roomId: 'room-9',
      conversationId: 'c-old',
    });
    expect(chat.getState().conversationId).toBeNull();
    expect(panelOf(chat)).toMatchObject({
      conversationId: null,
      roomId: 'room-9',
      roomPurpose: 'room',
    });
    expect(chat.getState().turns.some((turn) => turn.text === 'room-body')).toBe(true);

    chat.rehydrateTurns([{ id: 'u2', role: 'user', content: 'conv-body' }], {
      conversationId: 'never-listed',
    });
    expect(chat.getState().conversationId).toBe('never-listed');
    expect(panelOf(chat)).toMatchObject({
      conversationId: 'never-listed',
      roomId: null,
      roomPurpose: 'conversation',
    });
    expect(chat.getState().turns.some((turn) => turn.text === 'conv-body')).toBe(true);
  });

  it('still stores a server conversation id the unlocked chat has not seen', async () => {
    const { chat } = sendHarness({
      locked: false,
      messageSendConversationId: () => 'server-new',
    });
    const direct = await chat.sendMessage('ping', { conversationId: 'other' });
    expect(direct.ok).toBe(true);
    expect(chat.getState().conversationId).toBe('server-new');
    expect(panelOf(chat).conversationId).toBe('server-new');
  });

  it('still sends a room message when the chat is unlocked', async () => {
    const { chat, sent } = sendHarness({ locked: false });
    const room = await chat.sendRoomMessage('room-9', 'room ping');
    expect(room).toMatchObject({ ok: true });
    expect(sent.find((entry) => entry.command === 'anx.communicate.rooms.message.send')?.payload).toMatchObject({
      roomId: 'room-9',
      text: 'room ping',
    });
    await chat.streamInit({ roomId: 'room-9' });
    await chat.streamInit({ conversationId: 'never-listed' });
    expect(chat.getState().conversationId).toBe('never-listed');
    const resumed = await chat.resumeClientTool({
      callId: 'call-1',
      conversationId: 'never-listed',
      result: { status: 'done' },
    });
    expect(resumed.ok).toBe(true);
  });
});

function panelOf(chat: { getState: () => { panels: Array<{ conversationId: string | null; roomId: string | null; roomPurpose: string }>; activePanelIndex: number } }) {
  return chat.getState().panels[chat.getState().activePanelIndex];
}

function sendHarness(input: {
  locked: boolean;
  conversations?: ReturnType<typeof conversations>;
  /** When set, replaces the stream-init resource id. Null keeps the requested id. */
  streamResourceId?: () => string | null;
  /** When set, replaces the conversation id returned by message.send. */
  messageSendConversationId?: () => string | null;
  messageReplyText?: () => string;
  agentSource?: 'raw_models';
}) {
  const sent: Array<{ command: string; payload?: Record<string, unknown> }> = [];
  const logs: Array<{ event: string; extra?: unknown }> = [];
  const rows = input.conversations || conversations();
  const chat = createNexusChat({
    ...(input.locked ? { lockedAgent: { virtualEmployeeId: LOCKED } } : {}),
    ...(input.agentSource ? { agentSource: input.agentSource } : {}),
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
          const override = input.streamResourceId?.() || null;
          return {
            ok: true,
            data: {
              resourceId: override || payload?.conversationId || payload?.roomId || 'mine',
              endpoints: [],
            },
          };
        }
        if (
          command === 'anx.communicate.message.send' ||
          command === 'anx.communicate.rooms.message.send' ||
          command === 'anx.inference.chat.completions'
        ) {
          const override = input.messageSendConversationId?.() ?? null;
          return {
            ok: true,
            data: {
              text: input.messageReplyText?.() || 'ok',
              conversationId: input.messageSendConversationId
                ? override
                : payload?.conversationId || null,
            },
          };
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
