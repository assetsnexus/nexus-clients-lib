import { describe, expect, it, vi } from 'vitest';
import { createWakeController, type WakeWordEngineLike } from './wake.js';

function mockEngine(opts: { detecting: boolean }): WakeWordEngineLike & {
  fire: (confidence?: number) => void;
} {
  let onWake: ((d: { at: number; confidence: number | null; engineId: string }) => void) | null = null;
  let armed = false;
  return {
    available: true,
    getStatus: () => ({
      status: armed ? 'listening' : 'idle',
      detecting: armed && opts.detecting,
      message: null,
    }),
    load: async () => {},
    start: async (next) => {
      armed = true;
      onWake = next;
    },
    stop: () => {
      armed = false;
    },
    dispose: () => {
      armed = false;
      onWake = null;
    },
    fire: (confidence = 0.9) =>
      onWake?.({ at: 1, confidence, engineId: 'mock' }),
  };
}

const enabled = {
  enabled: true,
  phrase: 'Selene',
  requireUnlocked: false,
  surfaces: ['app', 'portal'],
  engine: 'builtin',
};

describe('chat-core wake surface', () => {
  it('starts off until the user opts in', async () => {
    const c = createWakeController({
      surface: 'app',
      config: enabled,
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
    });
    expect(c.getState().state).toBe('off');
    expect(await c.refresh()).toBe(false);
  });

  it('moves to wake_listening when opted in with a real detector', async () => {
    const c = createWakeController({
      surface: 'app',
      config: enabled,
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(true);
    expect(c.getState().state).toBe('wake_listening');
    expect(c.getState().micActive).toBe(true);
    expect(c.getState().phrase).toBe('Selene');
  });

  it('onWake only opens the voice session, never authenticates', async () => {
    const engine = mockEngine({ detecting: true });
    const open = vi.fn();
    const c = createWakeController({
      surface: 'app',
      config: enabled,
      engine,
      openVoiceSession: open,
    });
    await c.optIn();
    engine.fire(0.83);
    expect(open).toHaveBeenCalledTimes(1);
    const req = open.mock.calls[0][0];
    expect(req.reason).toBe('wake_word');
    expect(req.authenticated).toBe(false);
    expect(Object.keys(req).sort()).toEqual(
      ['authenticated', 'detection', 'reason', 'surface'].sort(),
    );
    expect(c.getState().state).toBe('opening');
  });

  it('never listens when the engine reports unavailable (stub)', async () => {
    const c = createWakeController({
      surface: 'app',
      config: enabled,
      engine: {
        available: false,
        getStatus: () => ({ status: 'unavailable', detecting: false, message: 'no artifact' }),
        load: async () => {},
        start: async () => {},
        stop: () => {},
        dispose: () => {},
      },
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(false);
    expect(c.getState().state).toBe('unavailable');
    expect(c.getState().micActive).toBe(false);
    expect(c.getState().message).toContain('artifact');
  });

  it('ignores configs that are not explicitly enabled', async () => {
    const c = createWakeController({
      surface: 'app',
      config: { enabled: false },
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(false);
    expect(c.getState().state).toBe('off');
  });

  it('requireUnlocked gates mobile listening', async () => {
    let unlocked = false;
    const c = createWakeController({
      surface: 'app',
      config: { ...enabled, requireUnlocked: true },
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
      isUnlocked: () => unlocked,
    });
    expect(await c.optIn()).toBe(false);
    unlocked = true;
    expect(await c.refresh()).toBe(true);
    expect(c.getState().state).toBe('wake_listening');
  });

  it('suspends when the surface closes and re-arms on refresh', async () => {
    let open = true;
    const c = createWakeController({
      surface: 'portal',
      config: enabled,
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
      isSurfaceOpen: () => open,
    });
    await c.optIn();
    open = false;
    c.suspend();
    expect(c.getState().state).toBe('suspended');
    open = true;
    expect(await c.refresh()).toBe(true);
    expect(c.getState().state).toBe('wake_listening');
  });

  it('suspends for a session and resumes after', async () => {
    const c = createWakeController({
      surface: 'app',
      config: enabled,
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
    });
    await c.optIn();
    c.suspendForSession();
    expect(c.getState().state).toBe('active');
    expect(await c.resumeAfterSession()).toBe(true);
    expect(c.getState().state).toBe('wake_listening');
  });

  it('does not listen on a surface not in config.surfaces', async () => {
    const c = createWakeController({
      surface: 'asset',
      config: enabled,
      engine: mockEngine({ detecting: true }),
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(false);
  });

  it('optOut fully stops the engine', async () => {    const engine = mockEngine({ detecting: true });
    const c = createWakeController({
      surface: 'app',
      config: enabled,
      engine,
      openVoiceSession: vi.fn(),
    });
    await c.optIn();
    c.optOut();
    expect(c.getState().state).toBe('off');
    expect(c.getState().optedIn).toBe(false);
  });
});
