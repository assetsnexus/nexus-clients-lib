/**
 * A `RESUME_IN_FLIGHT` 409 must NOT extinguish a live generation.
 *
 * The elevation/data-access resume rides `anx.communicate.client-tool.result`.
 * Inference answers `409 RESUME_IN_FLIGHT` when a resume (or a fresh turn) already
 * holds the conversation — the turn *is* live. The old code treated every
 * `ok:false` as fatal: it appended an error turn, set `streaming:false` and closed
 * the socket, so the thinking bubble / session-list dot / Cancel button vanished
 * even though the agent kept generating. These tests pin the non-fatal contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNexusChat, isResumeInFlight } from '../index.js';

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

type Sent = { command: string; payload?: Record<string, unknown> };

function makeChat(resumeResult: Record<string, unknown>, opts: { generationLive?: boolean } = {}) {
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
              token: 't',
              resourceId: payload?.conversationId || 'c1',
            },
          };
        }
        if (command === 'anx.communicate.message.send') {
          return { ok: true, data: { text: 'ok', conversationId: 'c1' } };
        }
        if (command === 'anx.communicate.conversations.get') {
          return {
            ok: true,
            data: {
              conversationId: 'c1',
              generationInProgress: opts.generationLive === true,
              pendingPause: null,
            },
          };
        }
        if (command === 'anx.communicate.client-tool.result') {
          return resumeResult;
        }
        return { ok: true, data: {} };
      },
    },
  });
  return { chat, sent };
}

describe('isResumeInFlight', () => {
  it('matches the structured RESUME_IN_FLIGHT code (top-level and nested)', () => {
    expect(isResumeInFlight({ ok: false, code: 'RESUME_IN_FLIGHT' })).toBe(true);
    expect(isResumeInFlight({ ok: false, error: { code: 'RESUME_IN_FLIGHT' } })).toBe(true);
    expect(isResumeInFlight({ ok: false, kind: 'RESUME_IN_FLIGHT' })).toBe(true);
  });

  it('matches the same-meaning codes and the human message', () => {
    expect(isResumeInFlight({ ok: false, code: 'GENERATION_IN_PROGRESS' })).toBe(true);
    expect(isResumeInFlight({ ok: false, message: 'A resume is already in flight' })).toBe(true);
    expect(
      isResumeInFlight({ ok: false, message: 'Generation already in progress for this conversation' }),
    ).toBe(true);
  });

  it('does not match unrelated failures or non-objects', () => {
    expect(isResumeInFlight({ ok: false, code: 'NO_PENDING_CLIENT_TOOL' })).toBe(false);
    expect(isResumeInFlight({ ok: false, message: 'permission denied' })).toBe(false);
    expect(isResumeInFlight(null)).toBe(false);
    expect(isResumeInFlight('RESUME_IN_FLIGHT')).toBe(false);
  });
});

describe('resumeClientTool on RESUME_IN_FLIGHT', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps streaming true, reports ok, and never appends an error turn', async () => {
    const { chat } = makeChat(
      {
        ok: false,
        code: 'RESUME_IN_FLIGHT',
        message: 'A resume is already in flight for this conversation',
      },
      { generationLive: true },
    );

    await chat.sendMessage('do the thing', { conversationId: 'c1' });
    await settle();

    const result = await chat.resumeClientTool({
      callId: 'call-inflight',
      conversationId: 'c1',
      result: { approved: true, decision: 'allow_once' },
    });
    await settle();

    // Not a failure: the turn is live, so the client must keep its chrome.
    expect(result.ok).toBe(true);
    expect(result.code).toBe('RESUME_IN_FLIGHT');
    expect(chat.getState().streaming).toBe(true);

    // No error turn was appended for the in-flight resume.
    const errored = chat.getState().turns.some(
      (turn) =>
        String(turn.text || '').toLowerCase().includes('already in flight') ||
        (turn.toolEvents || []).some((ev) =>
          String((ev as { data?: { message?: string } }).data?.message || '')
            .toLowerCase()
            .includes('already in flight'),
        ),
    );
    expect(errored).toBe(false);
  });

  it('clears streaming if the 409 was stale and nothing is actually live', async () => {
    // A 409 means *a* resume was in flight; if the generation already finished,
    // the client must not show a stuck thinking bubble / Cancel.
    const { chat } = makeChat(
      { ok: false, code: 'RESUME_IN_FLIGHT', message: 'A resume is already in flight' },
      { generationLive: false },
    );

    await chat.sendMessage('do the thing', { conversationId: 'c1' });
    await settle();

    const result = await chat.resumeClientTool({
      callId: 'call-stale',
      conversationId: 'c1',
      result: { approved: true, decision: 'allow_once' },
    });
    await settle();

    expect(result.ok).toBe(true);
    expect(chat.getState().streaming).toBe(false);
  });

  it('still treats a real failure as fatal (control)', async () => {
    const { chat } = makeChat({
      ok: false,
      code: 'SOMETHING_BROKE',
      message: 'Unexpected server error',
    });

    await chat.sendMessage('do the thing', { conversationId: 'c1' });
    await settle();

    const result = await chat.resumeClientTool({
      callId: 'call-real-fail',
      conversationId: 'c1',
      result: { approved: true, decision: 'allow_once' },
    });
    await settle();

    expect(result.ok).toBe(false);
    expect(chat.getState().streaming).toBe(false);
  });
});
