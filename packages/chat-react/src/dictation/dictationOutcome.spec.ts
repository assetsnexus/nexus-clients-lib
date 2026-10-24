import { describe, expect, it } from 'vitest';
import {
  MIN_CAPTURE_MS,
  DictationFailure,
  decideDictationCapture,
  dictationFailureMessage,
  micFailureCode,
  recognitionFailureCode,
  transcriptionFailureCode,
} from './dictationOutcome.js';

describe('decideDictationCapture', () => {
  it('inserts the live transcript even when the blob is empty', () => {
    expect(
      decideDictationCapture({
        liveText: '  hello there ',
        blobBytes: 0,
        captureMs: 0,
        rail: 'model',
        hasSpeechModel: true,
      }),
    ).toEqual({ action: 'insert', text: 'hello there', source: 'live' });
  });

  it('transcribes a real recording when there is no live text', () => {
    expect(
      decideDictationCapture({
        liveText: '',
        blobBytes: 12_000,
        captureMs: 2500,
        rail: 'model',
        hasSpeechModel: true,
      }),
    ).toEqual({ action: 'transcribe' });
  });

  it('sends the audio straight to the model on the direct rail', () => {
    expect(
      decideDictationCapture({
        liveText: '',
        blobBytes: 12_000,
        captureMs: 2500,
        rail: 'direct',
        hasSpeechModel: false,
      }),
    ).toEqual({ action: 'send-audio' });
  });

  it('reports a too-short press instead of a broken microphone', () => {
    const decision = decideDictationCapture({
      liveText: '',
      blobBytes: 0,
      captureMs: MIN_CAPTURE_MS - 1,
      rail: 'model',
      hasSpeechModel: true,
    });
    expect(decision).toEqual({
      action: 'fail',
      code: 'too-short',
      message: dictationFailureMessage('too-short'),
    });
  });

  it('reports no-audio when a long hold still produced nothing', () => {
    const decision = decideDictationCapture({
      liveText: '',
      blobBytes: 0,
      captureMs: 4000,
      rail: 'model',
      hasSpeechModel: true,
    });
    expect(decision.action).toBe('fail');
    if (decision.action === 'fail') expect(decision.code).toBe('no-audio');
  });

  it('reports a missing speech model before attempting transcription', () => {
    const decision = decideDictationCapture({
      liveText: '',
      blobBytes: 9000,
      captureMs: 2000,
      rail: 'model',
      hasSpeechModel: false,
    });
    expect(decision.action).toBe('fail');
    if (decision.action === 'fail') expect(decision.code).toBe('no-speech-model');
  });

  it('prefers a recogniser error over the generic no-transcript copy', () => {
    const decision = decideDictationCapture({
      liveText: '',
      blobBytes: 0,
      captureMs: 2000,
      rail: 'phone',
      hasSpeechModel: false,
      recognitionError: 'network',
    });
    expect(decision.action).toBe('fail');
    if (decision.action === 'fail') {
      expect(decision.code).toBe('network');
      expect(decision.message).toBe(dictationFailureMessage('network'));
    }
  });

  it('treats an empty phone capture with no error as nothing recognised', () => {
    const decision = decideDictationCapture({
      liveText: '',
      blobBytes: 0,
      captureMs: 0,
      rail: 'phone',
      hasSpeechModel: false,
      recognitionError: null,
    });
    expect(decision.action).toBe('fail');
    if (decision.action === 'fail') expect(decision.code).toBe('no-transcript');
  });
});

describe('failure code mapping', () => {
  it('maps getUserMedia rejections to microphone codes', () => {
    expect(micFailureCode({ name: 'NotAllowedError' })).toBe('mic-denied');
    expect(micFailureCode({ name: 'SecurityError' })).toBe('mic-denied');
    expect(micFailureCode({ name: 'NotFoundError' })).toBe('mic-missing');
    expect(micFailureCode({ name: 'OverconstrainedError' })).toBe('mic-missing');
    expect(micFailureCode(new Error('boom'))).toBe('mic-unavailable');
  });

  it('maps recogniser error strings to failure codes', () => {
    expect(recognitionFailureCode('network')).toBe('network');
    expect(recognitionFailureCode('service-not-allowed')).toBe('mic-denied');
    expect(recognitionFailureCode('audio-capture')).toBe('mic-missing');
    expect(recognitionFailureCode('no-speech')).toBe('no-transcript');
    expect(recognitionFailureCode(null)).toBe('no-transcript');
    expect(recognitionFailureCode('language-not-supported')).toBe('transcription-failed');
  });

  it('classifies transport-shaped transcriber errors as network', () => {
    expect(transcriptionFailureCode(new Error('Nexus could not be reached.'))).toBe('network');
    expect(transcriptionFailureCode(new Error('workload timed out'))).toBe('network');
    expect(transcriptionFailureCode(new Error('HTTP 503'))).toBe('network');
    expect(transcriptionFailureCode(new Error('E11000 duplicate key error'))).toBe(
      'transcription-failed',
    );
  });
});

describe('dictation failure copy', () => {
  it('never returns an empty or raw-recorder message', () => {
    const codes = [
      'mic-denied',
      'mic-missing',
      'mic-unavailable',
      'too-short',
      'no-audio',
      'no-transcript',
      'no-speech-model',
      'speech-unavailable',
      'network',
      'transcription-failed',
    ] as const;
    for (const code of codes) {
      const message = dictationFailureMessage(code);
      expect(message.trim().length).toBeGreaterThan(0);
      expect(message).not.toMatch(/recording was empty/i);
      expect(message).not.toMatch(/undefined/);
    }
  });

  it('never leaks a raw server detail through the canned transcription copy', () => {
    expect(dictationFailureMessage('transcription-failed')).not.toMatch(/E11000|mongo|dup key/i);
  });

  it('lets the host override the copy with its own hint', () => {
    const failure = new DictationFailure('no-speech-model', { message: 'Pick a speech model.' });
    expect(failure.message).toBe('Pick a speech model.');
    expect(failure.code).toBe('no-speech-model');
  });
});
