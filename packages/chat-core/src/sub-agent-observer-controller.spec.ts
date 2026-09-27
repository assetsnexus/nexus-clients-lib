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

  emit(ev: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(ev) });
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeChat(hooks: Record<string, unknown> = {}) {
  const chat = createNexusChat({
    client: {
      send: async (command: string) => {
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
    hooks,
  });
  chat.rehydrateTurns(
    [
      { id: 'u1', role: 'user', content: 'research' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Kicked off',
        toolCalls: [
          {
            callId: 'call_parent',
            name: 'run_sub_agent',
            kind: 'sub_agent',
            subAgentRunId: 'run_1',
            status: 'running',
            arguments: {},
          },
        ],
      },
    ],
    { conversationId: 'c1' },
  );
  return chat;
}

const subRow = (chat: ReturnType<typeof makeChat>) =>
  chat.getState().turns[1]!.toolEvents!.find((r) => r.id === 'call_parent')!;

describe('idle sub-agent observer', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams sub-agent output into the idle parent and surfaces its approval request', async () => {
    const onPermissionElevationRequired = vi.fn();
    const chat = makeChat({ onPermissionElevationRequired });
    chat.observeSubAgents({ conversationId: 'c1' });
    await flush();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.emit({ seq: 1, type: 'sub_agent_token', data: { subAgentRunId: 'run_1', text: 'Searching' } });
    ws.emit({
      seq: 2,
      type: 'permission_elevation_request',
      data: { subAgentRunId: 'run_1', runId: 'run_1', elevationId: 'elev_1', command: 'anx.ai-agents.web-search' },
    });
    // Replayed on reconnect — must not prompt twice.
    ws.emit({ seq: 2, type: 'permission_elevation_request', data: { subAgentRunId: 'run_1', elevationId: 'elev_1' } });

    expect(chat.getState().turns[1]!.rawToolStream!.map((e) => e.type)).toEqual(['sub_agent_token']);
    expect(onPermissionElevationRequired).toHaveBeenCalledTimes(1);
    expect(onPermissionElevationRequired.mock.calls[0]![0]).toMatchObject({
      elevationId: 'elev_1',
      subAgentRunId: 'run_1',
    });
    expect(chat.getState().streaming).toBe(false);
    chat.observeSubAgents({ conversationId: null });
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('hands a new parent generation to the host hook', async () => {
    const onObservedGenerationStart = vi.fn();
    const chat = makeChat({ onObservedGenerationStart });
    chat.observeSubAgents({ conversationId: 'c1' });
    await flush();
    await flush();
    FakeWebSocket.instances[0]!.emit({ seq: 3, type: 'conversation', data: { generationStart: true } });
    expect(onObservedGenerationStart).toHaveBeenCalledWith({ conversationId: 'c1' });
    expect(FakeWebSocket.instances[0]!.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('a live attach does not re-apply frames the observer already applied', async () => {
    const chat = makeChat({ onObservedGenerationStart: () => undefined });
    chat.observeSubAgents({ conversationId: 'c1' });
    await flush();
    await flush();
    FakeWebSocket.instances[0]!.emit({
      seq: 4,
      type: 'sub_agent_tool_call',
      data: { callId: 'child_1', name: 'anx_command', subAgentRunId: 'run_1' },
    });
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    const attachWs = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    attachWs.emit({
      seq: 4,
      type: 'sub_agent_tool_call',
      data: { callId: 'child_1', name: 'anx_command', subAgentRunId: 'run_1' },
    });
    expect(chat.getState().turns[1]!.rawToolStream).toHaveLength(1);
    attachWs.emit({ seq: 5, type: 'done' });
    await pending;
  });

  it('a sub-agent elevation during a live parent turn keeps the parent stream open', async () => {
    const onPermissionElevationRequired = vi.fn();
    const chat = makeChat({ onPermissionElevationRequired });
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.emit({ type: 'permission_elevation_request', data: { subAgentRunId: 'run_1', elevationId: 'e1' } });
    expect(onPermissionElevationRequired).toHaveBeenCalledTimes(1);
    expect(chat.getState().streaming).toBe(true);
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    ws.emit({ type: 'done' });
    await pending;
  });

  it('applies run states and inbox activity to the sub-agent row', () => {
    const chat = makeChat();
    expect(
      chat.applySubAgentRunStates([
        {
          runId: 'run_1',
          status: 'awaiting_approval',
          pendingApproval: { approvalKind: 'permission_elevation', elevationId: 'elev_1' },
        },
      ]),
    ).toBe(true);
    expect(subRow(chat).subAgentPhase).toBe('awaiting_approval');
    expect(
      chat.applySubAgentActivity({ kind: 'sub_agent', conversationId: 'c1', runId: 'run_1', status: 'running' }),
    ).toBe(true);
    expect(subRow(chat).subAgentPhase).toBe('running');
    expect(subRow(chat).subAgentPendingApproval).toBeNull();
    expect(
      chat.applySubAgentActivity({ kind: 'sub_agent', conversationId: 'other', runId: 'run_1', status: 'paused' }),
    ).toBe(false);
  });
});
