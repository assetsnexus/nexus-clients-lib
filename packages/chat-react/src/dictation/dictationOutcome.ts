/**
 * Dictation outcome policy (pure, framework-free).
 *
 * Hold-to-talk has three rails — the phone/browser recogniser, a speech model
 * over the region STT workload, and "send the audio straight to the model" — and
 * every one of them can come back empty for a different reason. Collapsing them
 * into a single "the recording was empty" message hid the real cause (a press
 * shorter than the microphone needed, a blocked mic, a subscription with no
 * speech model, an unreachable speech service) and told the user nothing they
 * could act on.
 *
 * This module owns the finish decision and the user-facing copy for each
 * failure, so the composer stays a thin caller and the policy is unit-testable
 * without a microphone, a region, or a DOM.
 */

/** Failure codes the composer can surface. Never a raw recorder error string. */
export type DictationFailureCode =
  | 'mic-denied'
  | 'mic-missing'
  | 'mic-unavailable'
  | 'too-short'
  | 'no-audio'
  | 'no-transcript'
  | 'no-speech-model'
  | 'speech-unavailable'
  | 'network'
  | 'transcription-failed';

/**
 * Shortest press worth sending to a transcriber. Below this the microphone has
 * not delivered a single encoded frame yet, so an empty capture means "you let
 * go too early", not "the microphone is broken".
 */
export const MIN_CAPTURE_MS = 300;

/** Which rail produced (or failed to produce) the capture. */
export type DictationRail = 'phone' | 'model' | 'direct';

export function dictationFailureMessage(code: DictationFailureCode): string {
  switch (code) {
    case 'mic-denied':
      return 'Microphone access is blocked. Allow it for this device, then hold to talk again.';
    case 'mic-missing':
      return 'No microphone was found. Connect one and hold to talk again.';
    case 'mic-unavailable':
      return 'This device cannot record audio.';
    case 'too-short':
      return 'That press was too short. Hold the mic button while you speak, then release.';
    case 'no-audio':
      return 'Nothing was recorded. Hold the mic button while you speak.';
    case 'no-transcript':
      return 'No speech was recognised. Try again and speak clearly.';
    case 'no-speech-model':
      return 'No speech model is available on this subscription. Choose one in Chat options, or switch dictation to the phone microphone.';
    case 'speech-unavailable':
      return 'Speech recognition is not available on this device. Choose a speech model in Chat options.';
    case 'network':
      return 'Speech recognition could not reach the speech service. Check your connection, or choose a speech model in Chat options.';
    case 'transcription-failed':
      // The server detail (a workload id, a Mongo error, a quota message) is
      // logged to the console by the caller; it is never shown to the user.
      return 'The speech service could not transcribe the recording. Try again in a moment.';
  }
}

/** Error carrying a failure code, so callers never parse message text. */
export class DictationFailure extends Error {
  readonly code: DictationFailureCode;

  /**
   * `message` overrides the canned copy — used when the host already computed a
   * more specific hint (e.g. the dictation note explaining which rail is missing).
   */
  constructor(code: DictationFailureCode, options: { message?: string | null } = {}) {
    super(options.message?.trim() || dictationFailureMessage(code));
    this.name = 'DictationFailure';
    this.code = code;
  }
}

/**
 * Map a batch-transcriber rejection to a failure code. A transport-shaped
 * message (unreachable / timed out / HTTP 5xx) reads as a connection problem
 * rather than "the model returned nothing", which is what the user needs.
 */
export function transcriptionFailureCode(error: unknown): DictationFailureCode {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  if (
    /unreachable|could not be reached|network|timeout|timed out|econn|socket|50[0-9]\b/i.test(
      detail,
    )
  ) {
    return 'network';
  }
  return 'transcription-failed';
}

/** Map a `getUserMedia` rejection to a microphone failure code. */
export function micFailureCode(error: unknown): DictationFailureCode {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name || '')
      : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'mic-denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'mic-missing';
  return 'mic-unavailable';
}

/**
 * Map a browser/native recogniser error string to a failure code. The phone
 * rail reports failures asynchronously (`SpeechRecognition.onerror`, or the
 * native bridge's `speechResult.error`) *after* the user released, so an empty
 * transcript plus a reported error must not be reported as "no speech".
 */
export function recognitionFailureCode(error: string | null | undefined): DictationFailureCode {
  const raw = String(error || '').trim().toLowerCase();
  if (!raw) return 'no-transcript';
  if (raw.includes('network')) return 'network';
  if (raw.includes('service-not-allowed') || raw.includes('not-allowed')) return 'mic-denied';
  if (raw.includes('audio-capture')) return 'mic-missing';
  if (raw.includes('no-speech')) return 'no-transcript';
  return 'transcription-failed';
}

export type DictationCaptureInput = {
  /** Transcript streamed live while the button was held. */
  liveText: string;
  /** Encoded audio size, bytes. */
  blobBytes: number;
  /** How long the microphone actually captured, ms. */
  captureMs: number;
  /** Rail that produced the capture. */
  rail: DictationRail;
  /** A speech model id is required to run the batch transcriber. */
  hasSpeechModel: boolean;
  /** Recogniser-reported error on the phone rail (never the empty string). */
  recognitionError?: string | null;
};

export type DictationCaptureDecision =
  /** The live preview already has the transcript; insert it. */
  | { action: 'insert'; text: string; source: 'live' }
  /** The active chat model takes audio directly; send the recording. */
  | { action: 'send-audio' }
  /** Run the batch transcriber on the recording. */
  | { action: 'transcribe' }
  | { action: 'fail'; code: DictationFailureCode; message: string };

/**
 * Decide what a finished hold-to-talk capture should do.
 *
 * Order matters: a live transcript wins even when the encoded blob is empty
 * (the streamed rail does not need one), and a real recogniser error beats the
 * generic "nothing was recognised" so the user sees the actionable cause.
 */
export function decideDictationCapture(input: DictationCaptureInput): DictationCaptureDecision {
  const live = input.liveText.trim();
  if (live) return { action: 'insert', text: live, source: 'live' };

  const fail = (code: DictationFailureCode): DictationCaptureDecision => ({
    action: 'fail',
    code,
    message: dictationFailureMessage(code),
  });

  if (input.rail === 'phone') {
    return fail(recognitionFailureCode(input.recognitionError));
  }

  if (input.blobBytes <= 0) {
    return fail(input.captureMs < MIN_CAPTURE_MS ? 'too-short' : 'no-audio');
  }

  if (input.rail === 'direct') return { action: 'send-audio' };

  if (!input.hasSpeechModel) return fail('no-speech-model');
  return { action: 'transcribe' };
}
