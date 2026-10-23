import { describe, expect, it, vi } from 'vitest';
import { createNexusChat } from '../index.js';
import {
  assistantFromFallbackCompletion,
  fallbackMessagesFromTurns,
  fallbackTransportSelected,
  type FallbackChatRequest,
  type FallbackChatTransport,
} from './fallback-transport.js';

describe('fallback transport selection', () => {
  it('uses the fallback when the host says Nexus is unavailable', async () => {
    const complete = vi.fn(async (_request: FallbackChatRequest) => ({
      choices: [{ message: { role: 'assistant', content: 'from-fallback' } }],
      cards: [{ id: 'c1', title: 'Note', body: 'A card', kind: 'content' }],
    }));
    const sent: string[] = [];
    const chat = createNexusChat({
      fallbackTransport: { nexusUnavailable: () => true, complete },
      client: {
        send: async (command: string) => {
          sent.push(command);
          return { ok: true, data: {} };
        },
      },
    });

    const result = await chat.sendMessage('hello fallback');
    expect(result).toMatchObject({ ok: true, transport: 'fallback' });
    expect(sent).toEqual([]);
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    expect(request?.messages).toEqual([{ role: 'user', content: 'hello fallback' }]);
    const turns = chat.getState().turns;
    expect(turns.map((turn) => turn.text)).toEqual(['hello fallback', 'from-fallback']);
    expect(turns[1]?.cards).toEqual([{ id: 'c1', title: 'Note', body: 'A card', kind: 'content' }]);
    expect(turns[1]?.toolEvents).toBeUndefined();
  });

  it('uses the Nexus command path when the host says the grant is available', async () => {
    const complete = vi.fn();
    const sent: string[] = [];
    const chat = createNexusChat({
      fallbackTransport: { nexusUnavailable: false, complete } as FallbackChatTransport,
      replyPoll: { intervalMs: 1, maxAttempts: 1 },
      client: {
        send: async (command: string) => {
          sent.push(command);
          if (command === 'anx.communicate.stream-init') return { ok: true, data: { endpoints: [] } };
          return { ok: true, data: { text: 'nexus' } };
        },
      },
    });

    const result = await chat.sendMessage('hello nexus', { conversationId: 'conv-1' });
    expect(result.ok).toBe(true);
    expect(complete).not.toHaveBeenCalled();
    expect(sent).toContain('anx.communicate.message.send');
  });

  it('uses the Nexus command path when the caller bypasses a sticky unavailable flag', async () => {
    const complete = vi.fn(async () => ({ choices: [{ message: { content: 'chi' } }] }));
    const sent: string[] = [];
    const chat = createNexusChat({
      fallbackTransport: { nexusUnavailable: () => true, complete },
      replyPoll: { intervalMs: 1, maxAttempts: 1 },
      client: {
        send: async (command: string) => {
          sent.push(command);
          if (command === 'anx.communicate.stream-init') return { ok: true, data: { endpoints: [] } };
          return { ok: true, data: { text: 'nexus' } };
        },
      },
    });
    const result = await chat.sendMessage('hello nexus', { conversationId: 'conv-1', bypassFallback: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transport).not.toBe('fallback');
    expect(complete).not.toHaveBeenCalled();
    expect(sent).toContain('anx.communicate.message.send');
  });

  it('reads a live host flag and ignores a transport that is not selected', () => {
    let unavailable = false;
    const transport: FallbackChatTransport = {
      nexusUnavailable: () => unavailable,
      complete: async () => ({ choices: [] }),
    };
    expect(fallbackTransportSelected(transport)).toBe(false);
    unavailable = true;
    expect(fallbackTransportSelected(transport)).toBe(true);
    expect(fallbackTransportSelected(null)).toBe(false);
  });

  it('keeps prior turns and drops empty cards', () => {
    expect(
      fallbackMessagesFromTurns([
        { role: 'user', text: 'one' },
        { role: 'assistant', text: 'two' },
        { role: 'system', text: '   ' },
      ]),
    ).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ]);
    expect(assistantFromFallbackCompletion({ choices: [{ message: { content: 'ok' } }], cards: [{ title: '' }] })).toEqual({
      text: 'ok',
      cards: [],
    });
  });
});
