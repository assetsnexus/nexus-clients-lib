import { describe, expect, it } from 'vitest';
import {
  autoCollapseList,
  composerModelPickerVisible,
  holdReleaseAction,
  modelAcceptsDirectAudio,
  pickWhisperModel,
  pointerLeftTarget,
  resolveDictationSelection,
} from './dictationPlan.js';

const whisper = {
  id: 'whisper-1',
  label: 'Whisper large',
  externalModelId: 'openai/whisper-large-v3',
  category: 'stt',
  capabilities: ['stt'],
};
const otherStt = {
  id: 'stt-2',
  label: 'Other speech',
  category: 'stt',
  capabilities: ['transcribe'],
};

describe('dictation plan', () => {
  it('keeps the model picker out of the composer', () => {
    expect(composerModelPickerVisible()).toBe(false);
  });

  it('collapses the list on a narrow overlay only after a thread is open', () => {
    expect(autoCollapseList({ stored: null, narrow: true, threadOpen: false })).toBeNull();
    expect(autoCollapseList({ stored: null, narrow: true, threadOpen: true })).toBe(true);
    expect(autoCollapseList({ stored: false, narrow: true, threadOpen: true })).toBeNull();
    expect(autoCollapseList({ stored: null, narrow: false, threadOpen: true })).toBeNull();
  });

  it('commits a hold that stays on the button and cancels a slide off', () => {
    const rect = { left: 10, top: 10, right: 50, bottom: 50 };
    expect(pointerLeftTarget(rect, 20, 20)).toBe(false);
    expect(holdReleaseAction({ leftTarget: false })).toBe('commit');
    expect(pointerLeftTarget(rect, 80, 20)).toBe(true);
    expect(holdReleaseAction({ leftTarget: true })).toBe('cancel');
  });

  it('uses phone speech by default and Whisper when the phone cannot listen', () => {
    expect(
      resolveDictationSelection({
        prefs: null,
        phoneAvailable: true,
        models: [otherStt, whisper],
        directSupported: false,
      }).method,
    ).toBe('phone');
    const fallback = resolveDictationSelection({
      prefs: { method: 'phone', sttModelId: null },
      phoneAvailable: false,
      models: [otherStt, whisper],
      directSupported: false,
    });
    expect(fallback.method).toBe('model');
    expect(fallback.sttModel?.id).toBe('whisper-1');
    expect(fallback.note).toMatch(/Whisper/);
    expect(pickWhisperModel([otherStt, whisper])?.id).toBe('whisper-1');
  });

  it('sends audio straight to a model that advertises audio input', () => {
    expect(modelAcceptsDirectAudio({ id: 'm', capabilities: ['audio_input'] })).toBe(true);
    expect(modelAcceptsDirectAudio({ id: 'm', capabilities: ['text_gen'] })).toBe(false);
    const direct = resolveDictationSelection({
      prefs: { method: 'direct', sttModelId: null },
      phoneAvailable: true,
      models: [whisper],
      directSupported: true,
    });
    expect(direct.method).toBe('direct');
  });
});
