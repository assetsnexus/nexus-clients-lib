import { describe, expect, it, vi } from 'vitest';
import type { ChatContact, NexusChat } from '@nexus/chat-core';
import {
  createGroupRoom,
  dmResumeIndex,
  findDmRoomForContact,
  selectionIsAgent,
  startAgentThread,
  startDirectMessage,
} from './startConversation.js';

const person: ChatContact = { id: 'u-1', name: 'Ada Lovelace', type: 'user' };
const agent: ChatContact = { id: 've-1', name: 'Rune', type: 'agent' };

type ChatStub = {
  chat: NexusChat;
  calls: Array<{ command: string; payload?: Record<string, unknown> }>;
  rehydrated: Array<{ turns: unknown[]; opts: Record<string, unknown> }>;
  streamed: Array<Record<string, unknown>>;
};

function makeChat(input: {
  rooms?: Array<Record<string, unknown>>;
  roomDetails?: Record<string, Record<string, unknown>>;
  createRoomId?: string;
  send?: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
}): ChatStub {
  const calls: ChatStub['calls'] = [];
  const rehydrated: ChatStub['rehydrated'] = [];
  const streamed: ChatStub['streamed'] = [];
  const send =
    input.send ||
    (async (command: string, payload?: Record<string, unknown>) => {
      calls.push({ command, payload });
      if (command === 'anx.communicate.rooms.create') {
        return { ok: true, data: { roomId: input.createRoomId || 'room-new' } };
      }
      if (command === 'anx.communicate.rooms.invite') {
        return { ok: true, data: { inviteCode: 'INVITE-1' } };
      }
      if (command === 'anx.communicate.conversations.create') {
        return { ok: true, data: { conversationId: 'conv-new' } };
      }
      return { ok: true, data: {} };
    });
  const chat = {
    sendMessage: vi.fn(),
    createRoom: vi.fn(async (payload: Record<string, unknown>) => {
      calls.push({ command: 'anx.communicate.rooms.create', payload });
      return { roomId: input.createRoomId || 'room-new' };
    }),
    createRoomInvite: vi.fn(async (payload: Record<string, unknown>) => {
      calls.push({ command: 'anx.communicate.rooms.invite', payload });
      return { inviteCode: 'INVITE-1' };
    }),
    updateRoom: vi.fn(async (payload: Record<string, unknown>) => {
      calls.push({ command: 'anx.communicate.rooms.update', payload });
    }),
    listRooms: vi.fn(async () => input.rooms || []),
    getRoom: vi.fn(async (roomId: string) => input.roomDetails?.[roomId] || { id: roomId, participants: [] }),
    streamInit: vi.fn(async (opts: Record<string, unknown>) => {
      streamed.push(opts);
    }),
    rehydrateTurns: (turns: unknown[], opts: Record<string, unknown>) => {
      rehydrated.push({ turns, opts });
    },
    getState: () => ({ contacts: [], selectedAgentId: null, conversationId: null, panels: [], activePanelIndex: 0 }),
    openContact: vi.fn(async () => ({ conversationId: 'conv-new' })),
    openLatest: vi.fn(async () => ({ conversationId: 'conv-latest', created: false })),
    listMessages: vi.fn(async () => []),
    observeSubAgents: vi.fn(),
    attachLiveGeneration: vi.fn(),
    _send: send,
  } as unknown as NexusChat;
  return { chat, calls, rehydrated, streamed };
}

describe('startConversation', () => {
  it('starts a NEW agent thread with forceNew semantics', async () => {
    const stub = makeChat({});
    const result = await startAgentThread(stub.chat, agent);
    expect(result).toEqual({ conversationId: 'conv-new', roomId: null });
    // forceNew is what distinguishes "Message agent" from resuming a thread.
    expect((stub.chat.openContact as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('ve-1', { forceNew: true });
  });

  it('opens an asset agent as a dm room and streams it', async () => {
    const stub = makeChat({ createRoomId: 'room-asset' });
    const result = await startAgentThread(stub.chat, {
      id: 'as-1',
      name: 'Printer',
      type: 'asset_agent',
      assetId: 'as-1',
      assetAgentKey: 'k-1',
    });
    expect(result).toEqual({ conversationId: null, roomId: 'room-asset' });
    expect(stub.streamed[0]).toEqual({ roomId: 'room-asset' });
    const create = stub.calls.find((c) => c.command === 'anx.communicate.rooms.create');
    expect(create?.payload).toMatchObject({ type: 'dm' });
  });

  it('resumes an existing dm room by default', async () => {
    const stub = makeChat({
      rooms: [
        { id: 'room-1', type: 'dm', participantNames: ['Ada Lovelace'] },
        { id: 'room-2', type: 'group' },
      ],
      roomDetails: {
        'room-1': { id: 'room-1', participants: [{ type: 'user', id: 'u-1' }] },
      },
    });
    const result = await startDirectMessage(stub.chat, person);
    expect(result).toEqual({ roomId: 'room-1', resumed: true });
    expect(stub.chat.createRoom).not.toHaveBeenCalled();
    expect(stub.streamed[0]).toEqual({ roomId: 'room-1' });
  });

  it('mints a fresh dm room when forceNew is set', async () => {
    const stub = makeChat({
      rooms: [{ id: 'room-1', type: 'dm', participantNames: ['Ada Lovelace'] }],
      roomDetails: { 'room-1': { id: 'room-1', participants: [{ type: 'user', id: 'u-1' }] } },
      createRoomId: 'room-fresh',
    });
    const result = await startDirectMessage(stub.chat, person, { forceNew: true });
    expect(result).toEqual({ roomId: 'room-fresh', resumed: false });
    expect(stub.chat.createRoom).toHaveBeenCalled();
  });

  it('creates a dm room when no matching thread exists', async () => {
    const stub = makeChat({
      rooms: [{ id: 'room-2', type: 'dm', participantNames: ['Someone Else'] }],
      roomDetails: { 'room-2': { id: 'room-2', participants: [{ type: 'user', id: 'u-9' }] } },
      createRoomId: 'room-new',
    });
    const result = await startDirectMessage(stub.chat, person);
    expect(result).toEqual({ roomId: 'room-new', resumed: false });
  });

  it('renames the resumed room when the user typed a name', async () => {
    const stub = makeChat({
      rooms: [{ id: 'room-1', type: 'dm', participantNames: ['Ada Lovelace'] }],
      roomDetails: { 'room-1': { id: 'room-1', participants: [{ type: 'user', id: 'u-1' }] } },
    });
    await startDirectMessage(stub.chat, person, { title: 'Coffee chat' });
    expect(stub.chat.updateRoom).toHaveBeenCalledWith({ roomId: 'room-1', name: 'Coffee chat' });
  });

  it('indexes the contacts that already have a dm room', async () => {
    const stub = makeChat({
      rooms: [
        { id: 'room-1', type: 'dm' },
        { id: 'room-2', type: 'dm' },
        { id: 'room-3', type: 'group' },
      ],
      roomDetails: {
        'room-1': {
          id: 'room-1',
          participants: [
            { type: 'user', id: 'u-1' },
            { type: 'agent', id: 've-1' },
          ],
        },
        'room-2': { id: 'room-2', participants: [{ type: 'user', id: 'u-2' }] },
        'room-3': { id: 'room-3', participants: [{ type: 'user', id: 'u-3' }] },
      },
    });
    const ids = await dmResumeIndex(stub.chat);
    // Only people count; the group room is skipped and agents are not contacts.
    expect(ids.sort()).toEqual(['u-1', 'u-2']);
  });

  it('returns no resume candidates when the room list fails', async () => {
    const stub = makeChat({});
    (stub.chat.listRooms as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    expect(await dmResumeIndex(stub.chat)).toEqual([]);
    expect(await findDmRoomForContact(stub.chat, person)).toBeNull();
  });

  it('creates a group room and returns an invite code when people were invited', async () => {
    const stub = makeChat({ createRoomId: 'room-group' });
    const result = await createGroupRoom(stub.chat, {
      title: 'Standup',
      encryptionMode: 'server_group_v1',
      aiParticipants: [{ type: 'agent', id: 've-1', displayName: 'Rune' }],
      participants: [{ type: 'user', id: 'u-1', displayName: 'Ada' }],
      messageTtlSeconds: 3600,
      createInviteForHumans: true,
    });
    expect(result).toEqual({ roomId: 'room-group', inviteCode: 'INVITE-1' });
    // An invite handoff means the room is not streamed yet; the dialog shows the code.
    expect(stub.streamed).toEqual([]);
  });

  it('streams the group room when there is no invite code to show', async () => {
    const stub = makeChat({ createRoomId: 'room-group' });
    const result = await createGroupRoom(stub.chat, {
      title: 'Solo',
      encryptionMode: 'server_group_v1',
      aiParticipants: [],
      participants: [],
      messageTtlSeconds: null,
      createInviteForHumans: false,
    });
    expect(result).toEqual({ roomId: 'room-group', inviteCode: null });
    expect(stub.streamed[0]).toEqual({ roomId: 'room-group' });
  });

  it('recognises which picker selections are agents', () => {
    expect(selectionIsAgent({ contact: agent, name: '', forceNew: true })).toBe(true);
    expect(selectionIsAgent({ contact: person, name: '', forceNew: false })).toBe(false);
    expect(
      selectionIsAgent({
        contact: { id: 'as', name: 'P', type: 'asset_agent' },
        name: '',
        forceNew: true,
      }),
    ).toBe(true);
  });
});
