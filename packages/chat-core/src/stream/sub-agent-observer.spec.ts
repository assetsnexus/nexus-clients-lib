import { describe, expect, it, vi } from 'vitest';
import { SubAgentObserver, type SubAgentObserverDeps } from './sub-agent-observer.js';
import type { StreamEvent } from './stream-events.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(overrides: Partial<SubAgentObserverDeps> = {}) {
  const sockets: Array<{
    close: ReturnType<typeof vi.fn>;
    onMessage: (ev: MessageEvent) => void;
    onClose: () => void;
  }> = [];
  const events: StreamEvent[] = [];
  const starts: string[] = [];
  const timers: Array<() => void> = [];
  let canObserve = true;
  const deps: SubAgentObserverDeps = {
    prepare: vi.fn(async () => true),
    connect: vi.fn(async (handlers) => {
      const s = { close: vi.fn(), ...handlers };
      sockets.push(s);
      return s;
    }),
    canObserve: () => canObserve,
    onEvent: (_c, ev) => events.push(ev),
    onGenerationStart: (c) => starts.push(c),
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => undefined,
    ...overrides,
  };
  const observer = new SubAgentObserver(deps);
  const send = (i: number, ev: unknown) =>
    sockets[i]!.onMessage({ data: JSON.stringify(ev) } as MessageEvent);
  return {
    observer,
    deps,
    sockets,
    events,
    starts,
    timers,
    send,
    setCanObserve: (v: boolean) => {
      canObserve = v;
    },
  };
}

describe('SubAgentObserver', () => {
  it('opens one socket per target and forwards only sub-agent / approval events', async () => {
    const h = harness();
    h.observer.setTarget('c1');
    h.observer.setTarget('c1');
    await flush();
    expect(h.sockets).toHaveLength(1);
    expect(h.observer.observing).toBe('c1');
    h.send(0, { type: 'token', data: { text: 'x' } });
    h.send(0, { type: 'sub_agent_token', data: { subAgentRunId: 'r1', text: 'a' } });
    h.send(0, { type: 'permission_elevation_request', data: { elevationId: 'e' } });
    expect(h.events.map((e) => e.type)).toEqual(['sub_agent_token', 'permission_elevation_request']);
  });

  it('hands a new parent generation to the live-attach path and suspends itself', async () => {
    const h = harness();
    h.observer.setTarget('c1');
    await flush();
    h.send(0, { type: 'conversation', data: { generationStart: true } });
    expect(h.starts).toEqual(['c1']);
    expect(h.sockets[0]!.close).toHaveBeenCalled();
    expect(h.observer.observing).toBeNull();
    expect(h.observer.targetConversationId).toBe('c1');
  });

  it('does not connect while a primary socket owns the conversation', async () => {
    const h = harness();
    h.setCanObserve(false);
    h.observer.setTarget('c1');
    await flush();
    expect(h.deps.connect).not.toHaveBeenCalled();
    h.setCanObserve(true);
    await h.observer.ensure();
    expect(h.sockets).toHaveLength(1);
  });

  it('discards a connect that finishes after suspend', async () => {
    let release!: () => void;
    const h = harness({
      prepare: () => new Promise<boolean>((r) => (release = () => r(true))),
    });
    h.observer.setTarget('c1');
    h.observer.suspend();
    release();
    await flush();
    expect(h.deps.connect).not.toHaveBeenCalled();
  });

  it('reconnects with backoff after an unexpected close, and stop cancels it', async () => {
    const h = harness();
    h.observer.setTarget('c1');
    await flush();
    h.sockets[0]!.onClose();
    expect(h.timers).toHaveLength(1);
    h.timers[0]!();
    await flush();
    expect(h.sockets).toHaveLength(2);
    h.observer.stop();
    expect(h.sockets[1]!.close).toHaveBeenCalled();
    expect(h.observer.targetConversationId).toBeNull();
  });

  it('ignores frames from a superseded socket', async () => {
    const h = harness();
    h.observer.setTarget('c1');
    await flush();
    h.observer.setTarget('c2');
    await flush();
    h.send(0, { type: 'sub_agent_token', data: { subAgentRunId: 'r1' } });
    expect(h.events).toHaveLength(0);
  });
});
