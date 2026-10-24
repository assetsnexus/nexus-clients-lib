import { describe, expect, it } from 'vitest';
import {
  MIN_CAPTURE_MS,
  DictationFailure,
  decideDictationCapture,
  dictationFailureMessage,
  micFailureCode,
  transcriptionFailureCode,
} from './dictationOutcome.js';

/**
 * The dictation policy now lives in `@nexus/chat-core`; the canonical unit tests
 * are `packages/chat-core/src/voice/dictation-outcome.spec.ts`. These assert the
 * adapter re-export stays wired to that one source of truth, so the composer's
 * import path cannot silently drift or fall back to a local copy.
 */
describe('dictationOutcome re-export', () => {
  it('exposes the shared capture policy', () => {
    expect(
      decideDictationCapture({
        liveText: 'hi',
        blobBytes: 0,
        captureMs: 0,
        rail: 'model',
        hasSpeechModel: true,
      }),
    ).toEqual({ action: 'insert', text: 'hi', source: 'live' });
    expect(MIN_CAPTURE_MS).toBe(300);
  });

  it('exposes the shared failure copy and code mapping', () => {
    expect(dictationFailureMessage('transcription-failed')).toMatch(/speech service/i);
    expect(transcriptionFailureCode(new Error('workload timed out'))).toBe('network');
    expect(micFailureCode({ name: 'NotAllowedError' })).toBe('mic-denied');
  });

  it('keeps the DictationFailure class identity from the shared module', () => {
    const failure = new DictationFailure('too-short');
    expect(failure.message).toBe(dictationFailureMessage('too-short'));
    expect(failure.code).toBe('too-short');
  });
});
