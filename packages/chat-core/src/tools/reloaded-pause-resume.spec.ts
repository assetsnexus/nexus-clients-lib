/**
 * Regression: a reloaded pause must be RE-DRIVEN, not just re-rendered.
 *
 * The live path resumes a `requiresApproval: false` client tool automatically
 * (page tools such as `anx.page.outline`). A reload only restores the persisted
 * `pendingPause` card, so the turn was never resumed — and the server keeps the
 * conversation's client-tool soft lock until a `client-tool.result` arrives.
 * Every later `message.send` is then deferred, and the user sees the composer
 * stuck on "Streaming…" with no reply, forever, on that thread.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNexusChat } from '../index.js';

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

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
};

type Sent = { command: string; payload?: Record<string, unknown> };

function makeChat() {
  const sent: Sent[] = [];
  const chat = createNexusChat({
    client: {
      send: async (command: string, payload?: Record<string, unknown>) => {
        sent.push({ command, payload });
        if (command === 'anx.communicate.stream-init') {
          return {
            ok: true,
            data: {
              endpoints: ['ws://stream.test/ws'],
              token: 'tok-1',
              purpose: 'conversation',
              resourceId: payload?.conversationId || 'c1',
            },
          };
        }
        if (command === 'anx.communicate.client-tool.result') {
          return { ok: true, data: { accepted: true, callId: payload?.callId } };
        }
        if (command === 'anx.communicate.message.send') {
          return { ok: true, data: { text: 'ok', conversationId: 'c1' } };
        }
        return { ok: true, data: {} };
      },
    },
  });
  return { chat, sent };
}

/** A page-tool card as `anx.communicate.conversations.get` returns it. */
const pageToolCard = {
  kind: 'client_tool' as const,
  callId: 'call-outline-1',
  name: 'anx.page.outline',
  arguments: {},
  access: 'read' as const,
  requiresApproval: false,
  action: 'request' as const,
};

const resumes = (sent: Sent[]) =>
  sent.filter((s) => s.command === 'anx.communicate.client-tool.result');

describe('reloaded pending-pause resume', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-runs the page tool and posts client-tool.result after a reload', async () => {
    const { chat, sent } = makeChat();
    const calls: unknown[] = [];
    chat.registerClientTool({
      name: 'anx.page.outline',
      description: 'Outline the current page',
      access: 'read',
      handler: (args) => {
        calls.push(args);
        return { headings: ['Overview'] };
      },
    });
    await chat.sendMessage('outline this page', { conversationId: 'c1' });
    await settle();

    // Reload: only the persisted card is known.
    chat.seedPendingPause(pageToolCard);
    await settle();

    expect(calls).toHaveLength(1);
    const posted = resumes(sent);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.payload).toMatchObject({
      conversationId: 'c1',
      callId: 'call-outline-1',
      result: { headings: ['Overview'] },
    });
  });

  it('does not auto-run a card that needs a human decision', async () => {
    const { chat, sent } = makeChat();
    let calls = 0;
    chat.registerClientTool({
      name: 'app.inventory.reserve',
      description: 'Reserve inventory',
      access: 'write',
      handler: () => {
        calls += 1;
        return { ok: true };
      },
    });
    await chat.sendMessage('reserve', { conversationId: 'c1' });
    await settle();

    chat.seedPendingPause({
      kind: 'client_tool',
      callId: 'call-reserve-1',
      name: 'app.inventory.reserve',
      arguments: { sku: 'S1' },
      access: 'write',
      requiresApproval: true,
      action: 'request',
    });
    await settle();

    // The approval card is a human decision: nothing runs and nothing resumes.
    expect(calls).toBe(0);
    expect(resumes(sent)).toHaveLength(0);
    expect(chat.getPendingPause()).toMatchObject({ callId: 'call-reserve-1' });
  });

  it('leaves an approval-rail card alone', async () => {
    const { chat, sent } = makeChat();
    await chat.sendMessage('do it', { conversationId: 'c1' });
    await settle();

    chat.seedPendingPause({
      kind: 'approval',
      callId: 'call-approval-1',
      name: 'anx_command',
      command: 'anx.crm.lead.create',
      arguments: {},
      mutationClass: 'business_write',
      mode: 'plan',
      preview: null,
    });
    await settle();

    expect(resumes(sent)).toHaveLength(0);
    expect(chat.getPendingPause()).toMatchObject({ kind: 'approval' });
  });

  it('seeding null clears the card without resuming', async () => {
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'anx.page.outline',
      description: 'Outline the current page',
      access: 'read',
      handler: () => ({ headings: [] }),
    });
    await chat.sendMessage('x', { conversationId: 'c1' });
    await settle();

    chat.seedPendingPause(pageToolCard);
    await settle();
    chat.seedPendingPause(null);
    await settle();

    expect(resumes(sent)).toHaveLength(1);
    expect(chat.getPendingPause()).toBeNull();
  });
});
