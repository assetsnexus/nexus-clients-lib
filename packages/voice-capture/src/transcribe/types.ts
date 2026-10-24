/**
 * Transcriber abstraction.
 *
 * A voice surface can transcribe in several places: an on-device GPU engine
 * (fast, private, needs a model), a local CPU engine (whisper.cpp), the region
 * cloud (best quality, audio leaves the device), or a partner endpoint. The
 * capture pipeline must not care *where* the text comes from — it only needs a
 * uniform "transcribe this audio" contract plus an honest flag for whether the
 * audio leaves the machine (the UI must warn about that).
 *
 * Pure: no Electron, no region client. Hosts implement a `Transcriber` and inject
 * it (the desktop app backs it with the local GPU runner and `@nexus/chat-core`).
 */

export type TranscribeInput = {
  /** Whole-utterance audio as a Blob (WAV/WebM; whichever the capture produced). */
  blob: Blob;
  /** Raw PCM of the current capture, when available, for engines that prefer it. */
  pcm?: Float32Array;
  /** Sample rate of `pcm`, Hz. */
  sampleRate?: number;
  /**
   * Phrases to bias the decoder toward (agent names, wake phrases). A local
   * engine maps these to its own biasing knob (`--hotwords`, `--prompt`).
   */
  phrases?: string[];
  /** True for a live preview call rather than the final transcription. */
  partial?: boolean;
  /** Language hint, when known. */
  language?: string | null;
};

export type Transcriber = {
  /** Stable id for diagnostics ("local-gpu", "region-cloud", …). */
  readonly id: string;
  /**
   * True when audio leaves the device for this transcriber. The UI keeps an
   * explicit "streaming" surface visible when this is true.
   */
  readonly leavesDevice: boolean;
  /** Transcribe one capture; resolves null when nothing usable was recognised. */
  transcribe(input: TranscribeInput): Promise<string | null>;
  /** Best-effort readiness probe for the settings/status UI. */
  status?: () => Promise<{ ready: boolean; label: string; reason?: string | null }>;
};

/**
 * Pick the first transcriber whose `status()` reports ready, preferring the
 * order given (callers pass the local engine first, then cloud). Falls back to
 * the last entry when nothing reports ready, so a capture still has an engine.
 */
export async function pickTranscriber(
  candidates: readonly Transcriber[],
  opts: { phrases?: () => string[] } = {},
): Promise<Transcriber | null> {
  if (candidates.length === 0) return null;
  for (const candidate of candidates) {
    if (!candidate.status) return candidate;
    try {
      const status = await candidate.status();
      if (status.ready) return candidate;
    } catch {
      // A probe failure is not fatal; try the next engine.
    }
  }
  // Nothing reported ready: use the first that declares itself usable, else the
  // first candidate so the user still gets an attempt (and therefore an error).
  void opts.phrases;
  return candidates[0] ?? null;
}
