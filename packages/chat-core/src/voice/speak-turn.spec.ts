import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./stt-tts.js', () => ({
  createAndPollTts: vi.fn(),
  playAudioUrl: vi.fn(),
}));

import { createAndPollTts, playAudioUrl } from './stt-tts.js';
import {
  contactTtsNeedsSetup,
  createSpeakTurnController,
} from './speak-turn.js';

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

  it('contactTtsNeedsSetup when effective model missing', () => {
    expect(contactTtsNeedsSetup(null)).toBe(true);
    expect(
      contactTtsNeedsSetup({
        agentId: 'a1',
        virtualAgentId: null,
        isOwner: false,
        canAdjust: true,
        canSetVoiceSample: true,
        ttsModelId: null,
        ttsVoiceConfigId: null,
        ttsVoicePreset: null,
        voiceSampleRef: null,
        voiceSampleTranscript: null,
        effectiveTtsModelId: null,
        effectiveTtsVoiceConfigId: null,
        effectiveVoicePreset: null,
        effectiveVoiceSampleRef: null,
        effectiveVoiceSampleTranscript: null,
      }),
    ).toBe(true);
    expect(
      contactTtsNeedsSetup({
        agentId: 'a1',
        virtualAgentId: null,
        isOwner: false,
        canAdjust: true,
        canSetVoiceSample: true,
        ttsModelId: 'tts-1',
        ttsVoiceConfigId: null,
        ttsVoicePreset: null,
        voiceSampleRef: null,
        voiceSampleTranscript: null,
        effectiveTtsModelId: 'tts-1',
        effectiveTtsVoiceConfigId: null,
        effectiveVoicePreset: null,
        effectiveVoiceSampleRef: null,
        effectiveVoiceSampleTranscript: null,
      }),
    ).toBe(false);
  });

  it('emits needs_setup when no model and no fallback', async () => {
    const send = vi.fn(async (command: string) => {
      if (command === 'anx.agents.contact-tts.get') {
        return {
          ok: true,
          data: {
            agentId: 'a1',
            canAdjust: true,
            canSetVoiceSample: true,
            effectiveTtsModelId: null,
          },
        };
      }
      return { ok: true };
    });
    const ctrl = createSpeakTurnController({
      client: { send },
      agentId: 'a1',
      fallbackModelId: null,
    });
    await ctrl.speak('hello');
    expect(ctrl.getState().phase).toBe('needs_setup');
    expect(createAndPollTts).not.toHaveBeenCalled();
    ctrl.dispose();
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
            canSetVoiceSample: true,
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
        canSetVoiceSample: true,
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

  it('passes contact voice sample to createAndPollTts', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      data: {
        agentId: 'a1',
        canSetVoiceSample: true,
        effectiveTtsModelId: 'tts-1',
        effectiveVoicePreset: 'preset-1',
        effectiveVoiceSampleRef: { bucketId: 'ws', objectKey: 'a.wav' },
        effectiveVoiceSampleTranscript: 'sample words',
      },
    }));
    vi.mocked(createAndPollTts).mockResolvedValue({
      ok: true,
      audioUrl: 'data:audio/mpeg;base64,AQID',
      workloadId: 'w2',
    } as never);
    vi.mocked(playAudioUrl).mockImplementation(async () => makeAudioEl());

    const ctrl = createSpeakTurnController({
      client: { send },
      agentId: 'a1',
    });
    await ctrl.speak('hello');
    expect(createAndPollTts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'tts-1',
        voice: 'preset-1',
        voiceSampleRef: { bucketId: 'ws', objectKey: 'a.wav' },
        voiceSampleTranscript: 'sample words',
      }),
      expect.anything(),
    );
    ctrl.dispose();
  });
});
