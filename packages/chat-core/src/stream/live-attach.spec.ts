import { describe, expect, it, vi } from 'vitest';
import { LiveAttachSession, liveAttachOutcomeForEvent } from './live-attach.js';

function manualTimers() {
  let fn: (() => void) | null = null;
  return {
    setIntervalFn: (f: () => void) => {
      fn = f;
      return 1;
    },
    clearIntervalFn: vi.fn(),
    fire: () => fn?.(),
  };
}

describe('liveAttachOutcomeForEvent', () => {
  it('maps terminal and pause events', () => {
    expect(liveAttachOutcomeForEvent('done')).toBe('done');
    expect(liveAttachOutcomeForEvent('error')).toBe('error');
    expect(liveAttachOutcomeForEvent('data_access_approval_request')).toBe('paused');
    expect(liveAttachOutcomeForEvent('token')).toBeNull();
    expect(liveAttachOutcomeForEvent(undefined)).toBeNull();
  });
});

describe('LiveAttachSession', () => {
  it('a terminal event wins over the close reason and settles once', async () => {
    const timers = manualTimers();
    const s = new LiveAttachSession({ checkLive: async () => true, onEnded: vi.fn(), ...timers });
    s.noteEvent('token');
    s.noteEvent('done');
    s.settle('superseded');
    s.settle('ended');
    await expect(s.promise).resolves.toEqual({ attached: true, outcome: 'done' });
    expect(timers.clearIntervalFn).toHaveBeenCalledTimes(1);
  });

  it('watchdog ends the attach only when idle and the server says not live', async () => {
    let now = 0;
    const timers = manualTimers();
    const checkLive = vi.fn(async () => false);
    const onEnded = vi.fn();
    const s = new LiveAttachSession({ checkLive, onEnded, idleMs: 1_000, now: () => now, ...timers });

    now = 500;
    await s.tick();
    expect(checkLive).not.toHaveBeenCalled();

    now = 1_600;
    await s.tick();
    expect(checkLive).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    s.settle('superseded');
    await expect(s.promise).resolves.toEqual({ attached: true, outcome: 'ended' });
  });

  it('keeps waiting while the server still reports the generation live', async () => {
    let now = 0;
    const timers = manualTimers();
    const onEnded = vi.fn();
    const s = new LiveAttachSession({
      checkLive: async () => true,
      onEnded,
      idleMs: 1_000,
      now: () => now,
      ...timers,
    });
    now = 2_000;
    await s.tick();
    now = 2_500;
    await s.tick();
    expect(onEnded).not.toHaveBeenCalled();
    expect(s.isSettled).toBe(false);
  });
});
