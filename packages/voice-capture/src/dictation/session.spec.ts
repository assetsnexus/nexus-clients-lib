import { describe, expect, it, vi } from 'vitest';
import { runDictation, type DictationCapture, type UtteranceSource } from './session.js';

/** A source that hands us the level callback so tests can drive the timeline. */
function controllableSource(): {
  source: UtteranceSource;
  emit: (level: number) => void;
  stop: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
} {
  let onLevel: ((level: number) => void) | null = null;
  const stop = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }));
  const cancel = vi.fn();
  const capture: DictationCapture = { stop, cancel };
  return {
    source: {
      async start(handler) {
        onLevel = handler;
        return capture;
      },
    },
    emit: (level) => onLevel?.(level),
    stop,
    cancel,
  };
}

/** Let the microtask queue flush so the `start().then` chain runs. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runDictation', () => {
  it('transcribes after trailing silence and resolves the text', async () => {
    const { source, emit } = controllableSource();
    const session = runDictation({
      source,
      transcribe: async () => 'hello world',
      silenceMs: 100,
      frameMs: 40,
    });
    await flush();
    emit(0.5); // speech
    emit(0.001);
    emit(0.001);
    emit(0.001); // 120ms trailing silence -> end of speech
    await expect(session.done).resolves.toBe('hello world');
  });

  it('resolves null without transcribing when no speech is heard', async () => {
    const { source, emit, cancel } = controllableSource();
    const transcribe = vi.fn(async () => 'never');
    const session = runDictation({
      source,
      transcribe,
      noSpeechMs: 80,
      frameMs: 40,
    });
    await flush();
    emit(0.0001);
    emit(0.0001);
    await expect(session.done).resolves.toBeNull();
    expect(transcribe).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('streams partials through onPartial when the capture can snapshot', async () => {
    vi.useFakeTimers();
    try {
      let onLevel: ((level: number) => void) | null = null;
      const capture: DictationCapture = {
        stop: async () => new Blob([new Uint8Array([1])]),
        cancel: vi.fn(),
        pcmSnapshot: () => new Float32Array(16),
      };
      const source: UtteranceSource = {
        async start(handler) {
          onLevel = handler;
          return capture;
        },
      };
      const onPartial = vi.fn();
      const session = runDictation({
        source,
        transcribe: async () => 'final',
        transcribePcm: async () => 'live words',
        onPartial,
        partialMs: 100,
        silenceMs: 5_000,
      });
      await vi.advanceTimersByTimeAsync(0);
      onLevel?.(0.5);
      await vi.advanceTimersByTimeAsync(150);
      expect(onPartial).toHaveBeenCalledWith('live words');
      onLevel?.(0.5);
      session.cancel();
      await expect(session.done).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel stops the capture and resolves null', async () => {
    const { source, cancel } = controllableSource();
    const session = runDictation({ source, transcribe: async () => 'x' });
    await flush();
    session.cancel();
    await expect(session.done).resolves.toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

  it('finish forces a transcription even before silence', async () => {
    const { source, emit } = controllableSource();
    const session = runDictation({ source, transcribe: async () => 'forced', silenceMs: 5_000 });
    await flush();
    emit(0.4);
    session.finish();
    await expect(session.done).resolves.toBe('forced');
  });

  it('surfaces a source failure as an error resolution', async () => {
    const session = runDictation({
      source: { async start() { throw new Error('no mic'); } },
      transcribe: async () => 'x',
    });
    await expect(session.done).resolves.toBeNull();
  });

  it('reports state transitions', async () => {
    const states: string[] = [];
    const { source, emit } = controllableSource();
    const session = runDictation({
      source,
      transcribe: async () => 'ok',
      silenceMs: 40,
      frameMs: 40,
      onStateChange: (s) => states.push(s),
    });
    await flush();
    emit(0.5);
    emit(0.001);
    await session.done;
    expect(states).toContain('listening');
    expect(states).toContain('transcribing');
    expect(states[states.length - 1]).toBe('done');
  });
});
