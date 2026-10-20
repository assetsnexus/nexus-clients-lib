/**
 * Plan-mode write client tool: the approval card must RUN the registered
 * handler and resume with its real result.
 *
 * Regression: the approval cards used to post a synthetic
 * `{ ok: true, granted: true }` stub and the handler never ran, because the
 * controller only auto-ran handlers for `requiresApproval === false`.
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

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await flush();
};

type Sent = { command: string; payload?: Record<string, unknown> };

function makeChat(hooks: { onClientToolRequest?: (req: unknown) => unknown } = {}) {
  const sent: Sent[] = [];
  const chat = createNexusChat({
    hooks: hooks as never,
    client: {
      send: async (command: string, payload?: Record<string, unknown>) => {
        sent.push({ command, payload });
        if (command === 'anx.communicate.stream-init') {
          const resourceId = payload?.conversationId || 'c1';
          return { ok: true, data: { endpoints: ['ws://stream.test/ws'], token: 't', resourceId } };
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

const resumes = (sent: Sent[]) =>
  sent.filter((e) => e.command === 'anx.communicate.client-tool.result');

describe('client-tool approval runs the handler', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('approving a requiresApproval write tool runs the handler once with its real result', async () => {
    const calls: unknown[] = [];
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'app.inventory.reserve',
      description: 'Reserve stock',
      access: 'write',
      handler: async (args) => {
        calls.push(args);
        return { reserved: true, sku: 'SKU-1', orderId: 'o-77' };
      },
    });

    await chat.sendMessage('reserve SKU-1', { conversationId: 'c1' });
    await settle();

    // The turn pauses on a client_tool_request the model raised in Plan mode.
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-1',
        name: 'app.inventory.reserve',
        arguments: { sku: 'SKU-1' },
        access: 'write',
        requiresApproval: true,
        action: 'request',
      },
    });
    await settle();

    // Paused: the handler has NOT run yet.
    expect(calls).toEqual([]);
    const card = chat.getPendingPause();
    expect(card).toMatchObject({ kind: 'client_tool', requiresApproval: true, callId: 'call-1' });

    const before = resumes(sent).length;
    const result = await chat.approveClientTool({ callId: 'call-1' });
    await settle();

    expect(result.ok).toBe(true);
    expect(result.ran).toBe(true);
    expect(calls).toEqual([{ sku: 'SKU-1' }]);
    const resume = resumes(sent).slice(before);
    expect(resume).toHaveLength(1);
    expect(resume[0]?.payload?.callId).toBe('call-1');
    // The REAL handler result — not the `{ granted: true }` stub.
    expect(resume[0]?.payload?.result).toEqual({ reserved: true, sku: 'SKU-1', orderId: 'o-77' });
    expect(chat.getPendingPause()).toBeNull();
  });

  it('runs the handler exactly once even if approveClientTool is called twice', async () => {
    let calls = 0;
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'app.inventory.reserve',
      access: 'write',
      handler: () => {
        calls += 1;
        return { reserved: true };
      },
    });
    await chat.sendMessage('reserve', { conversationId: 'c1' });
    await settle();
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-2',
        name: 'app.inventory.reserve',
        arguments: {},
        requiresApproval: true,
        action: 'request',
      },
    });
    await settle();

    const [first, second] = await Promise.all([
      chat.approveClientTool({ callId: 'call-2' }),
      chat.approveClientTool({ callId: 'call-2' }),
    ]);
    await settle();
    expect(calls).toBe(1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.code).toBe('NO_PAUSED_CLIENT_TOOL');
    expect(resumes(sent)).toHaveLength(1);
  });

  it('denying a requiresApproval tool resumes with a denial and never runs the handler', async () => {
    let calls = 0;
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'app.inventory.reserve',
      access: 'write',
      handler: () => {
        calls += 1;
        return { reserved: true };
      },
    });
    await chat.sendMessage('reserve', { conversationId: 'c1' });
    await settle();
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-3',
        name: 'app.inventory.reserve',
        arguments: {},
        requiresApproval: true,
        action: 'request',
      },
    });
    await settle();

    const result = await chat.approveClientTool({ callId: 'call-3', approved: false });
    await settle();
    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    const resume = resumes(sent).at(-1);
    expect(resume?.payload?.result).toMatchObject({ approved: false, granted: false });
  });

  it('still auto-runs a requiresApproval=false tool without any host call', async () => {
    const args: unknown[] = [];
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'anx.page.highlight',
      access: 'read',
      handler: (a) => {
        args.push(a);
        return { ok: true, highlighted: '#hero' };
      },
    });
    await chat.sendMessage('highlight', { conversationId: 'c1' });
    await settle();
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-4',
        name: 'anx.page.highlight',
        arguments: { selector: '#hero' },
        access: 'read',
        requiresApproval: false,
        action: 'request',
      },
    });
    await settle();
    expect(args).toEqual([{ selector: '#hero' }]);
    const resume = resumes(sent).at(-1);
    expect(resume?.payload?.result).toEqual({ ok: true, highlighted: '#hero' });
  });

  it('fails gracefully when no handler is registered for an approved tool', async () => {
    const { chat, sent } = makeChat();
    await chat.sendMessage('do it', { conversationId: 'c1' });
    await settle();
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-5',
        name: 'app.unknown.tool',
        arguments: {},
        requiresApproval: true,
        action: 'request',
      },
    });
    await settle();

    const result = await chat.approveClientTool({ callId: 'call-5' });
    await settle();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NO_CLIENT_TOOL_HANDLER');
    // Nothing was resumed with a bogus result.
    expect(resumes(sent)).toHaveLength(0);
  });

  it('reports NO_PAUSED_CLIENT_TOOL when nothing is paused', async () => {
    const { chat } = makeChat();
    const result = await chat.approveClientTool({ callId: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NO_PAUSED_CLIENT_TOOL');
  });

  it('answerClientToolPause runs the paused handler (public resolver)', async () => {
    let calls = 0;
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'app.inventory.reserve',
      access: 'write',
      handler: () => {
        calls += 1;
        return { reserved: true };
      },
    });
    await chat.sendMessage('reserve', { conversationId: 'c1' });
    await settle();
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-6',
        name: 'app.inventory.reserve',
        arguments: {},
        requiresApproval: true,
        action: 'request',
      },
    });
    await settle();

    const result = await chat.answerClientToolPause({ callId: 'call-6' });
    await settle();
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    expect(resumes(sent).at(-1)?.payload?.result).toEqual({ reserved: true });
  });

  it('answerClientToolPause with an explicit result resumes it verbatim', async () => {
    const { chat, sent } = makeChat();
    await chat.sendMessage('go', { conversationId: 'c1' });
    await settle();
    const result = await chat.answerClientToolPause({
      callId: 'call-7',
      result: { handRun: true },
    });
    await settle();
    expect(result.ok).toBe(true);
    expect(resumes(sent).at(-1)?.payload?.result).toEqual({ handRun: true });
  });

  it('seeds a runnable request from a reloaded client_tool approval card', async () => {
    let calls = 0;
    const { chat, sent } = makeChat();
    chat.registerClientTool({
      name: 'app.inventory.reserve',
      access: 'write',
      handler: () => {
        calls += 1;
        return { reserved: true };
      },
    });
    await chat.sendMessage('x', { conversationId: 'c1' });
    await settle();
    chat.seedPendingPause({
      callId: 'call-8',
      kind: 'client_tool',
      name: 'app.inventory.reserve',
      arguments: { sku: 'S1' },
      access: 'write',
      requiresApproval: true,
      action: 'request',
    });
    const result = await chat.approveClientTool({ callId: 'call-8' });
    await settle();
    expect(result.ok).toBe(true);
    expect(calls).toBe(1);
    expect(resumes(sent).at(-1)?.payload?.result).toEqual({ reserved: true });
  });
});
