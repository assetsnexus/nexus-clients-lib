import { describe, expect, it, vi } from 'vitest';
import {
  createStubDetector,
  type WakeArtifactFetcher,
  type WakeWordConfig,
  type WakeWordDetection,
  type WakeWordEngine,
  type WakeWordEngineStatus,
  type WakeWordOnWake,
} from './index.js';
import { WakeWordController } from './controller.js';
import { defaultWakeWordConfig } from './types.js';

/** A controllable engine for exercising the controller gates. */
function mockEngine(opts: { detecting: boolean }): WakeWordEngine & {
  fire: (d?: Partial<WakeWordDetection>) => void;
  started: boolean;
} {
  let onWake: WakeWordOnWake | null = null;
  let started = false;
  return {
    kind: 'builtin',
    available: true,
    get started() {
      return started;
    },
    getStatus(): WakeWordEngineStatus {
      return {
        kind: 'builtin',
        status: started ? 'listening' : 'idle',
        message: null,
        detecting: started && opts.detecting,
      };
    },
    async load() {
      /* noop */
    },
    async start(next: WakeWordOnWake) {
      started = true;
      onWake = next;
    },
    stop() {
      started = false;
    },
    dispose() {
      started = false;
      onWake = null;
    },
    fire(d: Partial<WakeWordDetection> = {}) {
      onWake?.({ at: 1, confidence: 0.9, engineId: 'test', ...d });
    },
  };
}

const enabled: WakeWordConfig = defaultWakeWordConfig({ enabled: true, requireUnlocked: false });

describe('WakeWordController', () => {
  it('stays off until the user opts in', async () => {
    const engine = mockEngine({ detecting: true });
    const open = vi.fn();
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'app',
      openVoiceSession: open,
    });
    expect(c.getState()).toBe('off');
    expect(await c.arm()).toBe(false);
    engine.fire();
    expect(open).not.toHaveBeenCalled();
  });

  it('arms to wake_listening when opted in and the engine detects', async () => {
    const engine = mockEngine({ detecting: true });
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'app',
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(true);
    expect(c.getState()).toBe('wake_listening');
    expect(c.isListening()).toBe(true);
  });

  it('onWake opens the voice session with authenticated:false and nothing else', async () => {
    const engine = mockEngine({ detecting: true });
    const open = vi.fn();
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'app',
      openVoiceSession: open,
    });
    await c.optIn();
    engine.fire({ confidence: 0.77 });
    expect(open).toHaveBeenCalledTimes(1);
    const request = open.mock.calls[0][0];
    expect(request.reason).toBe('wake_word');
    expect(request.authenticated).toBe(false);
    // The request carries no command/approval/2FA surface at all.
    expect(Object.keys(request).sort()).toEqual(
      ['authenticated', 'detection', 'reason', 'surface'].sort(),
    );
    expect(c.getState()).toBe('opening');
  });

  it('reports unavailable (never wake_listening) when the engine is a stub', async () => {
    const engine: WakeWordEngine = {
      kind: 'builtin',
      available: false,
      getStatus: () => ({
        kind: 'builtin',
        status: 'unavailable',
        message: 'no artifact',
        detecting: false,
      }),
      load: async () => {},
      start: async () => {},
      stop: () => {},
      dispose: () => {},
    };
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'app',
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(false);
    expect(c.getState()).toBe('unavailable');
    expect(c.isListening()).toBe(false);
  });

  it('suspends when the surface is closed and re-arms when reopened', async () => {
    const engine = mockEngine({ detecting: true });
    let open = true;
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'app',
      openVoiceSession: vi.fn(),
      isSurfaceOpen: () => open,
    });
    await c.optIn();
    expect(c.isListening()).toBe(true);
    open = false;
    await c.arm();
    expect(c.getState()).toBe('suspended');
    open = true;
    expect(await c.arm()).toBe(true);
    expect(c.getState()).toBe('wake_listening');
  });

  it('requireUnlocked gates listening on mobile', async () => {
    const engine = mockEngine({ detecting: true });
    let unlocked = false;
    const c = new WakeWordController({
      engine,
      config: defaultWakeWordConfig({ enabled: true, requireUnlocked: true }),
      surface: 'app',
      openVoiceSession: vi.fn(),
      isUnlocked: () => unlocked,
    });
    expect(await c.optIn()).toBe(false);
    expect(c.getState()).toBe('off');
    unlocked = true;
    expect(await c.arm()).toBe(true);
    expect(c.isListening()).toBe(true);
  });

  it('ignores surfaces not listed in config', async () => {
    const engine = mockEngine({ detecting: true });
    const c = new WakeWordController({
      engine,
      config: defaultWakeWordConfig({ enabled: true, requireUnlocked: false, surfaces: ['portal'] }),
      surface: 'app',
      openVoiceSession: vi.fn(),
    });
    expect(await c.optIn()).toBe(false);
  });

  it('optOut fully stops listening', async () => {
    const engine = mockEngine({ detecting: true });
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'app',
      openVoiceSession: vi.fn(),
    });
    await c.optIn();
    c.optOut();
    expect(c.getState()).toBe('off');
    expect(engine.started).toBe(false);
  });

  it('suspendForSession pauses, resumeAfterSession re-arms', async () => {
    const engine = mockEngine({ detecting: true });
    const c = new WakeWordController({
      engine,
      config: enabled,
      surface: 'portal',
      openVoiceSession: vi.fn(),
    });
    await c.optIn();
    c.suspendForSession();
    expect(c.getState()).toBe('active');
    expect(await c.resumeAfterSession()).toBe(true);
    expect(c.getState()).toBe('wake_listening');
  });

  it('the stub detector from the shipped engine never feeds the controller', () => {
    // Guard: a shipping stub must keep `detecting` false.
    expect(createStubDetector().detecting).toBe(false);
  });
});
