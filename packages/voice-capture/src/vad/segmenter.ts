/**
 * Energy VAD segmenter (pure).
 *
 * Turns a stream of fixed-size PCM frames into whole "speech segments": it opens
 * a segment on the first frame above the silence level, keeps appending while
 * speech continues, and closes it after enough trailing silence (or at a hard
 * cap). Each closed segment is handed to `onSegment` exactly once.
 *
 * This is the portable core of the wake STT-phrase engine: it segments once and
 * the caller decides what to do with each segment (transcribe locally, match a
 * phrase, append to an audio batch). It is deliberately unaware of transcription
 * and of *why* the segments exist.
 *
 * Pure of DOM/Electron/React so the segmentation policy is unit-testable without
 * a microphone.
 */

import { frameRms } from '../shared/rms.js';

export type Segment = {
  /** Contiguous PCM of one speech segment (includes its trailing silence). */
  pcm: Float32Array;
  /** Speech duration inside the segment, ms (excludes trailing silence). */
  speechMs: number;
  /** Sample rate of `pcm`, Hz. */
  sampleRate: number;
  /** Monotonic index of this segment since the last reset. */
  index: number;
};

export type SegmenterOptions = {
  /** Frame sample rate (Hz). */
  sampleRate: number;
  /** RMS at/below which a frame counts as silence (default 0.012). */
  silenceLevel?: number;
  /** Trailing silence that ends a segment, ms (default 500). */
  silenceMs?: number;
  /** Ignore segments whose speech is shorter than this, ms (default 300). */
  minSpeechMs?: number;
  /** Hard cap on one segment, ms (default 8000). */
  maxSegmentMs?: number;
  /** Called once per accepted segment, in order. */
  onSegment: (segment: Segment) => void;
  /**
   * Called on every frame with the current level and open/closed state, for a
   * meter or "is the user speaking" indicator (optional).
   */
  onFrame?: (info: { rms: number; sawSpeech: boolean; speechMs: number }) => void;
};

export type Segmenter = {
  /** Feed one frame. `at` is a monotonic timestamp (ms). */
  push(frame: Float32Array, at: number): void;
  /**
   * Update the capture rate. The microphone may pick a rate other than the one
   * requested, so the caller calls this once the stream is live to keep segment
   * timing honest.
   */
  setSampleRate(sampleRate: number): void;
  /** Close and emit the in-progress segment now (e.g. the user pressed stop). */
  flush(): void;
  /** Drop buffered audio without emitting. */
  reset(): void;
  /** True while a segment is open (speech has been seen). */
  readonly open: boolean;
};

export function createSegmenter(options: SegmenterOptions): Segmenter {
  let sampleRate = Math.max(8000, Math.round(options.sampleRate) || 16_000);
  const silenceLevel = options.silenceLevel ?? 0.012;
  const silenceMs = options.silenceMs ?? 500;
  const minSpeechMs = options.minSpeechMs ?? 300;
  const maxSegmentMs = options.maxSegmentMs ?? 8_000;

  let chunks: Float32Array[] = [];
  let totalSamples = 0;
  let speechMs = 0;
  let trailingSilenceMs = 0;
  let sawSpeech = false;
  let index = 0;

  const frameMs = (samples: number) => (samples / sampleRate) * 1000;

  function emit(): void {
    if (sawSpeech && speechMs >= minSpeechMs && totalSamples > 0) {
      const pcm = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        pcm.set(chunk, offset);
        offset += chunk.length;
      }
      options.onSegment({ pcm, speechMs, sampleRate, index: index++ });
    }
    chunks = [];
    totalSamples = 0;
    speechMs = 0;
    trailingSilenceMs = 0;
    sawSpeech = false;
  }

  return {
    get open() {
      return sawSpeech;
    },
    setSampleRate(next) {
      const rate = Math.max(8000, Math.round(next) || 0);
      if (rate) sampleRate = rate;
    },
    push(frame, _at) {
      if (!frame.length) return;
      const rms = frameRms(frame);
      const ms = frameMs(frame.length);
      options.onFrame?.({ rms, sawSpeech, speechMs });
      if (rms > silenceLevel) {
        sawSpeech = true;
        speechMs += ms;
        trailingSilenceMs = 0;
        chunks.push(frame.slice());
        totalSamples += frame.length;
        if (speechMs >= maxSegmentMs) emit();
        return;
      }
      if (!sawSpeech) return;
      trailingSilenceMs += ms;
      chunks.push(frame.slice());
      totalSamples += frame.length;
      if (trailingSilenceMs >= silenceMs) emit();
    },
    flush() {
      // Force a final segment only when real speech was heard; a flush on pure
      // silence must not fabricate an empty segment (`emit` still enforces the
      // min-speech gate, so a too-short tail is discarded consistently).
      if (!sawSpeech) return;
      emit();
    },
    reset() {
      chunks = [];
      totalSamples = 0;
      speechMs = 0;
      trailingSilenceMs = 0;
      sawSpeech = false;
    },
  };
}
