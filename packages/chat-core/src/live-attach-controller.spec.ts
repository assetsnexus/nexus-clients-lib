import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNexusChat } from './index.js';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.({});
    }, 0);
  }

  emit(ev: { type: string; data?: unknown }) {
    this.onmessage?.({ data: JSON.stringify(ev) });
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeChat(extra?: (command: string) => unknown) {
  const chat = createNexusChat({
    client: {
      send: async (command: string) => {
        const override = extra?.(command);
        if (override !== undefined) return override;
        if (command === 'anx.communicate.stream-init') {
          return {
            ok: true,
            data: { endpoints: ['ws://stream.test/ws'], token: 't', resourceId: 'c1' },
          };
        }
        if (command === 'anx.communicate.conversations.get') {
          return { ok: true, data: { generationInProgress: true } };
        }
        return { ok: true, data: {} };
      },
    },
  });
  chat.rehydrateTurns([{ id: 'u1', role: 'user', content: 'hi' }], { conversationId: 'c1' });
  return chat;
}

describe('attachLiveGeneration (reload while the agent is still working)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the in-flight text, keeps streaming (Cancel) until done', async () => {
    const chat = makeChat();
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();

    expect(chat.getState().streaming).toBe(true);
    const ws = FakeWebSocket.instances[0]!;
    ws.emit({ type: 'turn_snapshot', data: { text: 'Hello' } });
    ws.emit({ type: 'token', data: { text: ' world' } });
    const live = chat.getState().turns[chat.getState().turns.length - 1]!;
    expect(live.role).toBe('assistant');
    expect(live.text).toBe('Hello world');

    ws.emit({ type: 'done' });
    await expect(pending).resolves.toEqual({ attached: true, outcome: 'done' });
    expect(chat.getState().streaming).toBe(false);
  });

  it('does not attach twice while a socket is already open', async () => {
    const chat = makeChat();
    const first = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    await expect(chat.attachLiveGeneration({ conversationId: 'c1' })).resolves.toEqual({
      attached: false,
      outcome: 'not_live',
    });
    FakeWebSocket.instances[0]!.emit({ type: 'done' });
    await first;
  });

  it('skips a conversation that is no longer selected', async () => {
    const chat = makeChat();
    await expect(chat.attachLiveGeneration({ conversationId: 'other' })).resolves.toEqual({
      attached: false,
      outcome: 'not_live',
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('history reload supersedes the attach and clears the streaming chrome', async () => {
    const chat = makeChat();
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    chat.rehydrateTurns([{ id: 'u1', role: 'user', content: 'hi' }], { conversationId: 'c1' });
    await expect(pending).resolves.toEqual({ attached: true, outcome: 'superseded' });
    expect(chat.getState().streaming).toBe(false);
    expect(chat.getState().turns.map((t) => t.id)).toEqual(['u1']);
  });

  it('cancel of an orphaned generation ends the attach without waiting for done', async () => {
    const chat = makeChat((command) =>
      command === 'anx.communicate.conversations.cancel'
        ? { ok: true, responseObject: { cancelled: true, generationInProgress: false } }
        : undefined,
    );
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    await chat.cancelConversation({ conversationId: 'c1' });
    await expect(pending).resolves.toEqual({ attached: true, outcome: 'ended' });
    expect(chat.getState().streaming).toBe(false);
  });

  it('cancel of a live generation keeps the attach until the server reports done', async () => {
    const chat = makeChat((command) =>
      command === 'anx.communicate.conversations.cancel'
        ? { ok: true, responseObject: { cancelled: true, generationInProgress: true } }
        : undefined,
    );
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    await chat.cancelConversation({ conversationId: 'c1' });
    expect(chat.getState().streaming).toBe(false);
    FakeWebSocket.instances[0]!.emit({ type: 'done' });
    await expect(pending).resolves.toEqual({ attached: true, outcome: 'done' });
  });

  it('a server-side socket close without done ends the attach and drops the empty bubble', async () => {
    const chat = makeChat();
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    FakeWebSocket.instances[0]!.close();
    await expect(pending).resolves.toEqual({ attached: true, outcome: 'ended' });
    await flush();
    expect(chat.getState().streaming).toBe(false);
    expect(chat.getState().turns.map((t) => t.role)).toEqual(['user']);
  });
});
