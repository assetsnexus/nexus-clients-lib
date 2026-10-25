import { describe, expect, it } from 'vitest';
import {
  MIN_SPEECH_MS_FOR_MULTI_TOKEN,
  MIN_SPEECH_MS_FOR_SHORT_UTTERANCE,
  isFillerOnlyTranscript,
  isPlausibleSpeechTranscript,
  isRepetitionTranscript,
} from './no-speech.js';

/**
 * These cases are drawn from the real failure: `faster-whisper-tiny` fed silence
 * (a monitor source that captured nothing) emitted `ok` / `Ok` / `Q` / `F` /
 * `B3B` / repeated `ok`. They must be rejected; genuine utterances — including a
 * one-word wake name — must pass.
 */
describe('isFillerOnlyTranscript', () => {
  it('flags the classic silence fillers', () => {
    for (const text of ['ok', 'Ok', 'ok, ok', 'ok ok ok', 'yeah', 'uh', 'um', 'hmm', 'the']) {
      expect(isFillerOnlyTranscript(text)).toBe(true);
    }
  });

  it('does not flag a sentence that merely contains a filler', () => {
    expect(isFillerOnlyTranscript('ok open the door')).toBe(false);
    expect(isFillerOnlyTranscript('hey Xeni, are you there please')).toBe(false);
  });

  it('treats empty/punctuation-only as filler (nothing was heard)', () => {
    expect(isFillerOnlyTranscript('')).toBe(true);
    expect(isFillerOnlyTranscript('   ')).toBe(true);
    expect(isFillerOnlyTranscript('...')).toBe(true);
  });
});

describe('isRepetitionTranscript', () => {
  it('flags a short token looped three or more times', () => {
    expect(isRepetitionTranscript('ok ok ok')).toBe(true);
    expect(isRepetitionTranscript('Ok, ok, ok.')).toBe(true);
    expect(isRepetitionTranscript('the the the the')).toBe(true);
  });

  it('does not flag a normal sentence or a two-word repeat', () => {
    expect(isRepetitionTranscript('no no')).toBe(false);
    expect(isRepetitionTranscript('hello there hello there')).toBe(false);
    expect(isRepetitionTranscript('Xeni Xeni Xeni')).toBe(true); // a looped name is still a loop
  });
});

describe('isPlausibleSpeechTranscript', () => {
  it('rejects silence the model rendered as filler, letters or loops', () => {
    const junk = ['ok', 'Ok', 'ok, ok, ok', 'Q', 'F', 'D', 'uh', 'hmm'];
    for (const text of junk) {
      expect(isPlausibleSpeechTranscript(text)).toBe(false);
    }
  });

  it('rejects a single stray letter even without filler vocabulary', () => {
    expect(isPlausibleSpeechTranscript('Q')).toBe(false);
    expect(isPlausibleSpeechTranscript('D')).toBe(false);
  });

  it('keeps a genuine one-word wake name (the whole point of stt_phrase)', () => {
    expect(isPlausibleSpeechTranscript('Xeni')).toBe(true);
    expect(isPlausibleSpeechTranscript('Zeni,')).toBe(true);
    expect(isPlausibleSpeechTranscript('Nox', { speechMs: 400 })).toBe(true);
  });

  it('keeps real multi-word speech', () => {
    expect(isPlausibleSpeechTranscript('Hey Xeni, open the door')).toBe(true);
    expect(isPlausibleSpeechTranscript("Hey, don't open the door.")).toBe(true);
    expect(isPlausibleSpeechTranscript('The shuttle descended through the thin atmosphere')).toBe(true);
  });

  it('rejects a few words decoded from almost no speech (noise, not a sentence)', () => {
    expect(
      isPlausibleSpeechTranscript('open the door now', { speechMs: MIN_SPEECH_MS_FOR_MULTI_TOKEN - 10 }),
    ).toBe(false);
    // The same words with real speech duration are kept.
    expect(isPlausibleSpeechTranscript('open the door now', { speechMs: 900 })).toBe(true);
  });

  it('requires a word of speech behind a bare single word', () => {
    expect(isPlausibleSpeechTranscript('Xeni', { speechMs: MIN_SPEECH_MS_FOR_SHORT_UTTERANCE - 10 })).toBe(
      false,
    );
    expect(isPlausibleSpeechTranscript('Xeni', { speechMs: MIN_SPEECH_MS_FOR_SHORT_UTTERANCE })).toBe(true);
  });

  it('can disallow single-word utterances entirely', () => {
    expect(isPlausibleSpeechTranscript('Xeni', { speechMs: 500, allowSingleWord: false })).toBe(false);
    expect(isPlausibleSpeechTranscript('hey Xeni', { speechMs: 500, allowSingleWord: false })).toBe(true);
  });

  it('rejects empty input', () => {
    expect(isPlausibleSpeechTranscript('')).toBe(false);
    expect(isPlausibleSpeechTranscript('   ')).toBe(false);
  });
});
