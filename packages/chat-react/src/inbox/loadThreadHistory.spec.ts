import { describe, expect, it, vi } from 'vitest';
import type { NexusChat } from '@nexus/chat-core';
import { loadThreadHistory } from './loadThreadHistory.js';

type RehydrateCall = { turns: unknown[]; opts: Record<string, unknown> };

function makeChat(input: {
  listMessages?: (conversationId: string, opts?: { limit?: number }) => Promise<unknown[]>;
}): { chat: NexusChat; rehydrated: RehydrateCall[] } {
  const rehydrated: RehydrateCall[] = [];
  const chat = {
    listMessages: input.listMessages || (async () => []),
    rehydrateTurns: (turns: unknown[], opts: Record<string, unknown>) => {
      rehydrated.push({ turns, opts });
    },
  } as unknown as NexusChat;
  return { chat, rehydrated };
}

const client = (send: (command: string, payload?: Record<string, unknown>) => Promise<unknown>) =>
  ({ send }) as never;

describe('loadThreadHistory', () => {
  it('rehydrates turns straight from the message list', async () => {
    const { chat, rehydrated } = makeChat({
      listMessages: async () => [
        { id: 'm1', role: 'user', content: 'Hi' },
        { id: 'm2', role: 'assistant', text: 'Hello' },
      ],
    });
    const result = await loadThreadHistory({ chat, conversationId: 'c1' });
    expect(result).toEqual({ turnCount: 2, via: 'list' });
    expect(rehydrated[0].turns).toHaveLength(2);
    expect(rehydrated[0].turns[1]).toMatchObject({ id: 'm2', content: 'Hello' });
    expect(rehydrated[0].opts).toMatchObject({ conversationId: 'c1', detachStream: true });
  });

  it('falls back to conversations.get when the list is empty but the row expects content', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      data: { messages: [{ id: 'm1', role: 'assistant', content: 'Recovered' }] },
    }));
    const { chat, rehydrated } = makeChat({ listMessages: async () => [] });
    const result = await loadThreadHistory({
      chat,
      client: client(send),
      conversationId: 'c1',
      expectsContent: true,
    });
    expect(result).toEqual({ turnCount: 1, via: 'get' });
    expect(send).toHaveBeenCalledWith('anx.communicate.conversations.get', { conversationId: 'c1' });
    expect(rehydrated[0].turns[0]).toMatchObject({ content: 'Recovered' });
  });

  it('does not call conversations.get when the row says the thread is empty', async () => {
    const send = vi.fn(async () => ({ ok: true, data: { messages: [{ id: 'x' }] } }));
    const { chat, rehydrated } = makeChat({ listMessages: async () => [] });
    const result = await loadThreadHistory({
      chat,
      client: client(send),
      conversationId: 'c-empty',
      expectsContent: false,
    });
    expect(result).toEqual({ turnCount: 0, via: 'none' });
    expect(send).not.toHaveBeenCalled();
    // The empty state is explicit, never a silently blank thread.
    expect(rehydrated).toHaveLength(1);
    expect(rehydrated[0].turns).toEqual([]);
  });

  it('treats a denied conversations.get as an empty thread', async () => {
    const { chat } = makeChat({ listMessages: async () => [] });
    const result = await loadThreadHistory({
      chat,
      client: client(async () => ({ ok: false, message: 'denied' })),
      conversationId: 'c1',
      expectsContent: true,
    });
    expect(result).toEqual({ turnCount: 0, via: 'none' });
  });

  it('reads a legacy `turns` body and a responseObject envelope', async () => {
    const { chat } = makeChat({ listMessages: async () => [] });
    const result = await loadThreadHistory({
      chat,
      client: client(async () => ({
        responseObject: { turns: [{ id: 't1', role: 'assistant', content: 'Legacy' }] },
      })),
      conversationId: 'c1',
      expectsContent: true,
    });
    expect(result).toEqual({ turnCount: 1, via: 'get' });
  });

  it('opens empty when messages.list throws and the row expects no content', async () => {
    const { chat, rehydrated } = makeChat({
      listMessages: async () => {
        throw new Error('boom');
      },
    });
    const result = await loadThreadHistory({ chat, conversationId: 'c1' });
    expect(result).toEqual({ turnCount: 0, via: 'none' });
    expect(rehydrated[0].turns).toEqual([]);
  });

  it('survives a conversations.get failure and still rehydrates empty', async () => {
    const { chat, rehydrated } = makeChat({ listMessages: async () => [] });
    const result = await loadThreadHistory({
      chat,
      client: client(async () => {
        throw new Error('network');
      }),
      conversationId: 'c1',
      expectsContent: true,
    });
    expect(result).toEqual({ turnCount: 0, via: 'none' });
    expect(rehydrated).toHaveLength(1);
  });
});
