import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./stt-tts.js', () => ({
  createAndPollTts: vi.fn(),
  playAudioUrl: vi.fn(),
}));

import { createAndPollTts, playAudioUrl } from './stt-tts.js';
import { createSpeakTurnController } from './speak-turn.js';

function makeAudioEl(): HTMLAudioElement {
  const listeners = new Map<string, Set<() => void>>();
  return {
    pause: vi.fn(),
    src: '',
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
      if (type === 'ended') {
        queueMicrotask(() => fn());
      }
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  } as unknown as HTMLAudioElement;
}

describe('createSpeakTurnController', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cancels playing TTS and cancels workload', async () => {
    const send = vi.fn(async (command: string) => {
      if (command === 'anx.agents.contact-tts.get') {
        return {
          ok: true,
          data: {
            agentId: 'a1',
            isOwner: false,
            canAdjust: true,
            effectiveTtsModelId: 'tts-1',
            effectiveVoicePreset: 'alloy',
          },
        };
      }
      if (command === 'anx.inference.workloads.cancel') {
        return { ok: true };
      }
      return { ok: true };
    });
    vi.mocked(createAndPollTts).mockResolvedValue({
      ok: true,
      audioUrl: 'https://example/a.mp3',
      workloadId: 'w1',
    } as never);
    vi.mocked(playAudioUrl).mockImplementation(
      () =>
        new Promise<HTMLAudioElement>(() => {
          /* hang until cancel */
        }),
    );

    const ctrl = createSpeakTurnController({
      client: { send },
      agentId: 'a1',
      fallbackModelId: 'fallback',
    });
    const speakPromise = ctrl.speak('hello');
    await vi.waitFor(() => expect(ctrl.getState().phase).toBe('playing'));
    expect(ctrl.getState().workloadId).toBe('w1');

    await ctrl.cancel();
    expect(ctrl.getState().phase).toBe('idle');
    expect(send).toHaveBeenCalledWith('anx.inference.workloads.cancel', {
      workloadId: 'w1',
    });
    ctrl.dispose();
    await Promise.race([speakPromise, Promise.resolve()]);
  });

  it('replays cached audioUrl without recreating', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      data: {
        agentId: 'a1',
        effectiveTtsModelId: 'tts-1',
        effectiveVoicePreset: 'alloy',
      },
    }));
    vi.mocked(createAndPollTts).mockResolvedValue({
      ok: true,
      audioUrl: 'https://example/cached.mp3',
      workloadId: 'w9',
    } as never);
    vi.mocked(playAudioUrl).mockImplementation(async () => makeAudioEl());

    const ctrl = createSpeakTurnController({
      client: { send },
      agentId: 'a1',
      fallbackModelId: 'fallback',
    });
    await ctrl.speak('hello');
    expect(ctrl.getState().phase).toBe('done');
    expect(ctrl.getState().audioUrl).toBe('https://example/cached.mp3');

    vi.mocked(createAndPollTts).mockClear();
    await ctrl.replay();
    expect(createAndPollTts).not.toHaveBeenCalled();
    expect(playAudioUrl).toHaveBeenCalledWith('https://example/cached.mp3');
    expect(ctrl.getState().phase).toBe('done');
    ctrl.dispose();
  });
});
