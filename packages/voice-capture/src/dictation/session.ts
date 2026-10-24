/**
 * Dictation controller (pure, framework-free).
 *
 * Captures one spoken utterance, ends the turn on trailing silence, transcribes
 * it, and hands back the text — with an optional live STT preview streamed as the
 * user speaks. Dependency-injected so the end-of-speech policy is unit-testable
 * without a microphone or a region.
 *
 * This is the portable half of the desktop wake dictation: the *transport* (local
 * GPU engine vs region cloud STT) and the *capture* (microphone, MediaRecorder)
 * are injected by the host, so the same policy serves a desktop app, a web chat
 * widget and a mobile client.
 *
 * TRUST: the transcript is an ordinary *user* message and carries no authority.
 * A wake word is not authentication and never approves anything.
 */

export type DictationCapture = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  /**
   * The audio captured so far, without ending the turn — used for a live STT
   * preview. Optional: a capture without it simply produces no partials.
   */
  snapshot?: () => Promise<Blob | null>;
  /**
   * Deliver the live PCM instead of a Blob. Preferred when the transcriber can
   * work frame-by-frame (a local engine), because re-encoding a Blob every few
   * hundred ms is wasteful. Optional.
   */
  pcmSnapshot?: () => Float32Array | null;
};

/**
 * A capture that also reports the input level, so the session can detect the
 * end of speech. `onLevel` receives a 0..1-ish RMS per frame.
 */
export type UtteranceSource = {
  start: (onLevel: (level: number) => void) => Promise<DictationCapture>;
};

export type DictationState =
  | 'listening'
  | 'transcribing'
  | 'done'
  | 'empty'
  | 'error'
  | 'cancelled';

export type DictationOptions = {
  /** Open one utterance on the microphone. */
  source: UtteranceSource;
  /** Transcribe a captured blob; resolves null when nothing was recognised. */
  transcribe: (blob: Blob) => Promise<string | null>;
  /**
   * Transcribe live PCM for the preview (optional). When supplied it takes
   * precedence over `transcribe(snapshotBlob)` for the partial path, which lets a
   * local engine skip the WAV/Blob round-trip.
   */
  transcribePcm?: (pcm: Float32Array, sampleRate: number) => Promise<string | null>;
  /** Sample rate of the PCM the capture produces (default 16000). */
  sampleRate?: number;
  onStateChange?: (state: DictationState) => void;
  /**
   * Live STT preview: called with the best-effort transcript of the audio so far
   * (only fires when the source can `snapshot()`/`pcmSnapshot()`). Kept separate
   * from the final result so a partial is never mistaken for the committed text.
   */
  onPartial?: (text: string) => void;
  /** Hard cap on utterance length (default 15s). */
  maxMs?: number;
  /** Trailing silence that ends the turn (default 1.2s). */
  silenceMs?: number;
  /** Level below which a frame counts as silence (default 0.02). */
  silenceLevel?: number;
  /** Time to wait for the first speech before giving up (default 6s). */
  noSpeechMs?: number;
  /** Assumed spacing between level frames, ms (default 40 ≈ 25fps). */
  frameMs?: number;
  /**
   * How often to refresh the live preview, ms (default 900). 0 disables it — the
   * preview is off by default when no `onPartial` is supplied.
   */
  partialMs?: number;
};

export type DictationSession = {
  /** Resolves with the transcript, or null when nothing usable was captured. */
  readonly done: Promise<string | null>;
  /** Stop now and transcribe what was captured. */
  finish(): void;
  /** Abandon the capture without transcribing. */
  cancel(): void;
};

/**
 * Run one dictation turn. Returns the transcript (or null when the user said
 * nothing / the microphone or transcription failed).
 */
export function runDictation(options: DictationOptions): DictationSession {
  const maxMs = options.maxMs ?? 15_000;
  const silenceMs = options.silenceMs ?? 1_200;
  const silenceLevel = options.silenceLevel ?? 0.02;
  const noSpeechMs = options.noSpeechMs ?? 6_000;
  const frameMs = options.frameMs ?? 40;
  const sampleRate = options.sampleRate ?? 16_000;
  const partialMs = options.onPartial ? (options.partialMs ?? 900) : 0;

  let heardSpeech = false;
  let silenceAccumMs = 0;
  let elapsedMs = 0;
  let finished = false;
  let capture: DictationCapture | null = null;
  let resolveDone: (value: string | null) => void = () => {};
  let partialTimer: ReturnType<typeof setInterval> | null = null;
  /** Guard so a slow preview of one snapshot never overlaps the next. */
  let partialInFlight = false;

  const done = new Promise<string | null>((resolve) => {
    resolveDone = resolve;
  });

  const setState = (next: DictationState) => options.onStateChange?.(next);

  const stopPartial = () => {
    if (partialTimer) {
      clearInterval(partialTimer);
      partialTimer = null;
    }
  };

  /**
   * Best-effort live preview: transcribe whatever audio exists *so far* without
   * ending the turn. Purely additive — a failure here is swallowed so the real
   * transcription is unaffected.
   */
  const refreshPartial = async (): Promise<void> => {
    if (finished || partialInFlight || !options.onPartial) return;
    partialInFlight = true;
    try {
      const pcm = capture?.pcmSnapshot?.() ?? null;
      if (pcm && options.transcribePcm) {
        const text = await options.transcribePcm(pcm, sampleRate);
        if (finished || !text?.trim()) return;
        options.onPartial(text.trim());
        return;
      }
      const snapshot = capture?.snapshot;
      if (!snapshot) return;
      const blob = await snapshot();
      if (finished || !blob || blob.size === 0) return;
      const text = await options.transcribe(blob);
      if (finished || !text?.trim()) return;
      options.onPartial(text.trim());
    } catch {
      // A preview must never disturb the turn.
    } finally {
      partialInFlight = false;
    }
  };

  const transcribeNow = async (force: boolean): Promise<void> => {
    if (finished) return;
    stopPartial();
    if (!capture) {
      finished = true;
      setState('empty');
      resolveDone(null);
      return;
    }
    // A give-up with no speech never reaches the transcriber: there is nothing
    // to recognise, and sending silence just burns a workload call.
    if (!force && !heardSpeech) {
      finished = true;
      capture.cancel();
      capture = null;
      setState('empty');
      resolveDone(null);
      return;
    }
    const handle = capture;
    capture = null;
    finished = true;
    setState('transcribing');
    try {
      // Grab the whole-utterance PCM *before* stopping, so a local engine can
      // transcribe the raw samples and skip the Blob/WAV round-trip entirely
      // (the same engine also serves the live preview).
      const pcm = handle.pcmSnapshot?.() ?? null;
      const blob = await handle.stop();
      let text: string | null = null;
      if (options.transcribePcm && pcm && pcm.length) {
        text = await options.transcribePcm(pcm, sampleRate);
      } else if (blob && blob.size > 0) {
        text = await options.transcribe(blob);
      } else {
        setState('empty');
        resolveDone(null);
        return;
      }
      const trimmed = text?.trim() ? text.trim() : null;
      setState(trimmed ? 'done' : 'empty');
      resolveDone(trimmed);
    } catch {
      setState('error');
      resolveDone(null);
    }
  };

  const onLevel = (level: number) => {
    if (finished) return;
    elapsedMs += frameMs;
    if (level >= silenceLevel) {
      heardSpeech = true;
      silenceAccumMs = 0;
    } else if (heardSpeech) {
      silenceAccumMs += frameMs;
    }
    const endOfSpeech = heardSpeech && silenceAccumMs >= silenceMs;
    const tooLong = elapsedMs >= maxMs;
    const gaveUp = !heardSpeech && elapsedMs >= noSpeechMs;
    if (endOfSpeech || tooLong || gaveUp) void transcribeNow(heardSpeech);
  };

  void options.source
    .start(onLevel)
    .then((handle) => {
      if (finished) {
        handle.cancel();
        return;
      }
      capture = handle;
      if (partialMs > 0 && (handle.snapshot || handle.pcmSnapshot)) {
        partialTimer = setInterval(() => void refreshPartial(), partialMs);
      }
    })
    .catch(() => {
      finished = true;
      setState('error');
      resolveDone(null);
    });

  setState('listening');
  return {
    done,
    finish() {
      void transcribeNow(true);
    },
    cancel() {
      if (finished) return;
      finished = true;
      stopPartial();
      capture?.cancel();
      capture = null;
      setState('cancelled');
      resolveDone(null);
    },
  };
}
