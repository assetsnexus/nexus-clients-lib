/**
 * Regression: one permission-elevation pause must surface ONE prompt.
 *
 * The backend emits BOTH a `tool_result` carrying `{ needsApproval: true,
 * approvalKind: 'permission_elevation', elevationId }` AND a
 * `permission_elevation_request` for the same pause, and a new socket (retry
 * send / reconnect) replays both from the Redis buffer. `permission_elevation_request`
 * is seq-deduped by `SubAgentSeqTracker`, but `tool_result` is NOT a tracked type
 * (`isTracked` only covers `sub_agent_*` + the two approval-request types), so the
 * replayed `tool_result` re-fired `onPermissionElevationRequired` for an elevation
 * the user had already answered — the prompt came back after "Allow always".
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

const ELEVATION = 'elev_answered_1';
const CALL_ID = 'call_1';

/** The `tool_result` payload the backend streams for an elevation pause. */
const elevationToolResult = () => ({
  callId: CALL_ID,
  name: 'anx_command',
  command: 'anx.crm.project.list',
  status: 'needs_approval',
  result: {
    needsApproval: true,
    approvalKind: 'permission_elevation',
    elevationId: ELEVATION,
    pack: 'crm.project',
    commandNames: ['anx.crm.project.list'],
  },
});

/** The dedicated elevation frame for the SAME pause. */
const elevationRequest = () => ({
  type: 'permission_elevation_request',
  data: {
    callId: CALL_ID,
    elevationId: ELEVATION,
    pack: 'crm.project',
    commandNames: ['anx.crm.project.list'],
  },
});

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
  chat.rehydrateTurns([{ id: 'u1', role: 'user', content: 'list crm projects' }], {
    conversationId: 'c1',
  });
  return chat;
}

describe('permission elevation prompt dedupe', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not re-prompt when the tool_result and permission_elevation_request carry the same elevation', async () => {
    const onPermissionElevationRequired = vi.fn();
    const chat = makeChat({ onPermissionElevationRequired });
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    const ws = FakeWebSocket.instances[0]!;

    // Backend order for one pause: needs_approval tool_result, then the
    // dedicated elevation request, then `paused`.
    ws.emit({ seq: 10, type: 'tool_result', data: elevationToolResult() });
    ws.emit({ seq: 11, ...elevationRequest() });

    expect(onPermissionElevationRequired).toHaveBeenCalledTimes(1);
    expect(onPermissionElevationRequired.mock.calls[0]![0]).toMatchObject({
      elevationId: ELEVATION,
    });

    ws.emit({ type: 'done' });
    await pending;
  });

  it('does not re-prompt when a reconnect replays the answered elevation frames', async () => {
    const onPermissionElevationRequired = vi.fn();
    const chat = makeChat({ onPermissionElevationRequired });

    const first = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.emit({ seq: 10, type: 'tool_result', data: elevationToolResult() });
    ws1.emit({ seq: 11, ...elevationRequest() });
    expect(onPermissionElevationRequired).toHaveBeenCalledTimes(1);
    ws1.emit({ type: 'done' });
    await first;

    // The user answered; a later socket replays the same frames from the buffer.
    const second = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    const ws2 = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws2.emit({ seq: 10, type: 'tool_result', data: elevationToolResult() });
    ws2.emit({ seq: 11, ...elevationRequest() });

    expect(onPermissionElevationRequired).toHaveBeenCalledTimes(1);
    ws2.emit({ type: 'done' });
    await second;
  });

  it('still prompts for a genuinely new elevation id', async () => {
    const onPermissionElevationRequired = vi.fn();
    const chat = makeChat({ onPermissionElevationRequired });
    const pending = chat.attachLiveGeneration({ conversationId: 'c1' });
    await flush();
    await flush();
    const ws = FakeWebSocket.instances[0]!;

    ws.emit({ seq: 10, type: 'tool_result', data: elevationToolResult() });
    ws.emit({
      seq: 20,
      type: 'permission_elevation_request',
      data: { callId: 'call_2', elevationId: 'elev_new_2', pack: 'crm.project' },
    });

    expect(onPermissionElevationRequired).toHaveBeenCalledTimes(2);
    ws.emit({ type: 'done' });
    await pending;
  });
});
