/**
 * Transcript hygiene for gated speech (shared, pure).
 *
 * Whisper is famous for hallucinating on non-speech: fed silence, room tone or a
 * mic's self-noise, it confidently emits filler ("ok", "Ok"), single letters
 * ("Q", "F", "D"), repeated/looped tokens ("ok, ok, ok") and — when the decoder
 * is biased toward wake phrases — phantom names ("Vylaar.") that would then fire
 * a *wake word*. The engine-side no-speech gate (faster-whisper's
 * `no_speech_threshold`) is the first line of defence, but a wake path must not
 * depend on every engine getting that right: the local engine may be whisper.cpp
 * (which has no such threshold), a custom endpoint, or an older spawn.
 *
 * This module is the engine-agnostic second line: it rejects a transcript that
 * is *structurally* not speech — empty, a filler-only utterance, a single
 * character, or a degenerate token repetition — while leaving real short
 * utterances (which are long relative to the segment's speech time) untouched.
 * Pure and dependency-free so both the wake hub and unit tests share it.
 */

/**
 * Whisper's silence/noise filler vocabulary. These are the tokens the model
 * reaches for when there is nothing to transcribe; a transcript made up *only*
 * of them (optionally repeated) is treated as non-speech. Kept deliberately
 * small and English-agnostic where possible so a genuine one-word command is
 * never dropped.
 */
export const TRANSCRIPT_FILLER_WORDS: ReadonlySet<string> = new Set([
  'ok',
  'okay',
  'k',
  'uh',
  'um',
  'hmm',
  'mm',
  'mmm',
  'ah',
  'eh',
  'oh',
  'yeah',
  'yep',
  'nope',
  'huh',
  'hm',
  'you',
  'bye',
  'the',
  'a',
  'i',
  'so',
  'and',
]);

/**
 * Minimum *speech* duration (ms) required to accept a short, plain utterance.
 * A clip with very little real speech but a few decoded words is almost always a
 * hallucination (the model invents words from noise). Requiring ~a word's worth
 * of speech keeps "hey" (a plausible wake) while dropping noise-driven filler.
 */
export const MIN_SPEECH_MS_FOR_SHORT_UTTERANCE = 220;

/**
 * Below this speech duration (ms), a multi-token transcript is suspicious even
 * when the tokens are not in the filler set (noise can decode into arbitrary
 * short words). Combined with {@link MIN_SPEECH_MS_FOR_SHORT_UTTERANCE}.
 */
export const MIN_SPEECH_MS_FOR_MULTI_TOKEN = 320;

export type NoSpeechGateOptions = {
  /** Speech duration inside the segment, ms (excludes trailing silence). */
  speechMs?: number;
  /**
   * Allow single-word utterances. A wake phrase is often one word ("Xeni"), so
   * the wake hub leaves this on; callers that never expect a one-word utterance
   * may turn it off.
   */
  allowSingleWord?: boolean;
  /** Treat a repeated-token transcript (e.g. "ok ok ok") as non-speech (default true). */
  rejectRepetition?: boolean;
};

/** Normalize a word for filler/normalization comparisons (unicode-safe). */
function normWord(raw: string): string {
  return (raw ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * True when a transcript is *only* silence filler: every non-empty word is in
 * {@link TRANSCRIPT_FILLER_WORDS} and the transcript is short. A longer sentence
 * that happens to contain "ok" is not filler.
 */
export function isFillerOnlyTranscript(raw: string): boolean {
  const words = (raw ?? '').split(/\s+/).map(normWord).filter(Boolean);
  if (words.length === 0) return true;
  if (words.length > 4) return false;
  return words.every((w) => TRANSCRIPT_FILLER_WORDS.has(w));
}

/**
 * True when a transcript is a degenerate repetition of one short token enough
 * times to be a loop hallucination ("ok ok ok", "the the the"). A short repeated
 * word is not speech; a normal sentence with a doubled word is left alone.
 */
export function isRepetitionTranscript(raw: string): boolean {
  const words = (raw ?? '').split(/\s+/).map(normWord).filter(Boolean);
  if (words.length < 3) return false;
  const [first] = words;
  if (!first || first.length > 4) return false;
  return words.every((w) => w === first);
}

/**
 * Deciding whether a transcript is real speech, or a silence/noise artefact the
 * caller should discard. Pure: all inputs are the transcript plus what the
 * segmenter already knows about the segment, so it is fully unit-testable.
 *
 * Returns `true` when the transcript should be **kept**.
 */
export function isPlausibleSpeechTranscript(
  raw: string,
  options: NoSpeechGateOptions = {},
): boolean {
  const text = (raw ?? '').trim();
  if (!text) return false;
  const words = text.split(/\s+/).map(normWord).filter(Boolean);
  if (words.length === 0) return false;

  // A single stray character ("Q", "F", "D") is never a real utterance.
  if (words.length === 1 && words[0]!.length <= 1) return false;

  // Filler-only and degenerate repetition are the classic silence decodes.
  if (isFillerOnlyTranscript(text)) return false;
  if ((options.rejectRepetition ?? true) && isRepetitionTranscript(text)) return false;

  const speechMs = typeof options.speechMs === 'number' ? options.speechMs : null;
  if (speechMs !== null) {
    // Very short speech cannot have produced many words: that is noise.
    const minMulti = speechMs < MIN_SPEECH_MS_FOR_MULTI_TOKEN && words.length > 2;
    if (minMulti) return false;
    // A bare single word needs a word's worth of speech behind it, so a
    // filler-ish noise blip the model rendered as a real word is dropped.
    const allowSingle = options.allowSingleWord ?? true;
    if (!allowSingle && words.length === 1) return false;
    if (words.length === 1 && speechMs < MIN_SPEECH_MS_FOR_SHORT_UTTERANCE) return false;
  }

  return true;
}
