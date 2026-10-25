/**
 * Regression: a resumed client-tool turn must be able to deliver to the client.
 *
 * `anx.communicate.stream-init` MINTS a single-use stream token into the resolver;
 * the WebSocket handshake CONSUMES it (`singleUse: true` on `AnxStreamGateway`).
 * The paused turn's token was already spent when its own socket opened. So a resume
 * that opened the socket BEFORE calling `stream-init` re-presented a used jti, the
 * gateway answered `ALREADY_USED`, and the resumed turn's output — including the
 * injected client-tool request — had no live socket. The host never ran the tool,
 * so nothing reached the suggestion store and the card never rendered.
 *
 * These tests pin the ordering contract: `stream-init` must complete before
 * `connectWebSocket`, and the socket must carry the freshly minted token.
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
  for (let i = 0; i < 8; i += 1) await flush();
};

/** An ordered log of what the controller did, in the order it did it. */
type Step = { kind: 'stream-init'; token: string } | { kind: 'ws-connect'; token: string | null };

function makeChat() {
  const steps: Step[] = [];
  let minted = 0;
  const chat = createNexusChat({
    client: {
      send: async (command: string, payload?: Record<string, unknown>) => {
        if (command === 'anx.communicate.stream-init') {
          // Every call mints a NEW single-use token and publishes it to the resolver,
          // exactly like the server + `StreamEndpointResolver.setFromStreamInit`.
          minted += 1;
          const token = `tok-${minted}`;
          steps.push({ kind: 'stream-init', token });
          return {
            ok: true,
            data: {
              endpoints: ['ws://stream.test/ws'],
              token,
              purpose: 'conversation',
              resourceId: payload?.conversationId || 'c1',
            },
          };
        }
        if (command === 'anx.communicate.message.send') {
          return { ok: true, data: { text: 'ok', conversationId: 'c1' } };
        }
        if (command === 'anx.communicate.conversations.get') {
          return { ok: true, data: { conversationId: 'c1', pendingPause: null } };
        }
        if (command === 'anx.communicate.client-tool.result') {
          return { ok: true, data: { accepted: true, callId: payload?.callId } };
        }
        return { ok: true, data: {} };
      },
    },
  });
  return { chat, steps };
}

/** Record the token each socket was opened with, against the step log. */
function instrumentSockets(steps: Step[]) {
  const Original = FakeWebSocket;
  const realInstances = Original.instances;
  Original.instances = [];
  class Tracked extends Original {
    constructor(url: string) {
      super(url);
      const token = new URL(url).searchParams.get('token');
      steps.push({ kind: 'ws-connect', token });
      realInstances.push(this);
    }
  }
  vi.stubGlobal('WebSocket', Tracked);
  return { instances: realInstances };
}

describe('client-tool resume stream handshake', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mints a fresh token BEFORE opening the resume socket', async () => {
    const { chat, steps } = makeChat();
    const { instances } = instrumentSockets(steps);

    chat.registerClientTool({
      name: 'app.xcamp.suggestion.show',
      description: 'Render a suggestion card',
      access: 'read',
      handler: () => ({ ok: true, suggestionId: 'sug-1' }),
    });

    await chat.sendMessage('show a suggestion', { conversationId: 'c1' });
    await settle();
    instances.at(-1)!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-handshake',
        name: 'app.xcamp.suggestion.show',
        arguments: { kind: 'task', title: 'Follow up' },
        access: 'read',
        requiresApproval: false,
        action: 'request',
      },
    });
    await settle();

    // The auto-run rail resumes the pause; wait for its socket to open.
    await settle();

    // The send consumed tok-1, the resume must consume a FRESH tok-2. The resume's
    // init is therefore the last stream-init and its connect is the last connect.
    const resumeInit = steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.kind === 'stream-init')
      .at(-1)!;
    const resumeConnectIndex = steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.kind === 'ws-connect')
      .at(-1)!.i;
    expect(resumeInit.s).toMatchObject({ kind: 'stream-init', token: 'tok-2' });
    expect(resumeConnectIndex).toBeGreaterThan(resumeInit.i);

    // The socket carried the token minted by that init — not a spent one.
    expect(steps[resumeConnectIndex]).toMatchObject({
      kind: 'ws-connect',
      token: (resumeInit.s as Extract<Step, { kind: 'stream-init' }>).token,
    });
  });

  it('stream-inits exactly once per resume and does not re-mint after connecting', async () => {
    const { chat, steps } = makeChat();
    const { instances } = instrumentSockets(steps);

    chat.registerClientTool({
      name: 'app.xcamp.suggestion.show',
      access: 'read',
      handler: () => ({ ok: true, suggestionId: 'sug-2' }),
    });

    await chat.sendMessage('show', { conversationId: 'c1' });
    await settle();
    const initsAfterSend = steps.filter((s) => s.kind === 'stream-init').length;

    instances.at(-1)!.emit({
      type: 'client_tool_request',
      data: {
        callId: 'call-once',
        name: 'app.xcamp.suggestion.show',
        arguments: {},
        access: 'read',
        requiresApproval: false,
        action: 'request',
      },
    });
    await settle();
    await settle();

    const inits = steps.filter((s) => s.kind === 'stream-init');
    expect(inits.length).toBe(initsAfterSend + 1);

    // The resume's single init precedes its connect; nothing re-mints afterwards.
    const lastInitIdx = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'stream-init').at(-1)!.i;
    const connectIdx = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'ws-connect').at(-1)!.i;
    expect(lastInitIdx).toBeLessThan(connectIdx);
    expect(steps.slice(connectIdx + 1).filter((s) => s.kind === 'stream-init')).toHaveLength(0);
  });
});
