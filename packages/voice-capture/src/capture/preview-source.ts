/**
 * Dual-mode utterance source.
 *
 * One microphone subscription serves *both* capture modes at once:
 *
 *  - **Live preview**: contiguous PCM is accumulated and handed to the dictation
 *    controller, which streams an on-device transcript into the composer as the
 *    user speaks (`pcmSnapshot`), and ends the turn on trailing silence.
 *  - **Audio batch**: the same frames are segmented by a VAD and every speech
 *    chunk is appended to a single audio batch, so a fallback "send the audio
 *    itself" message is always available even if the on-device transcript is
 *    poor (or no local engine exists at all).
 *
 * A pre-roll prefix (the audio captured *before* the wake phrase fired) can be
 * seeded into both the batch and the level clock so the utterance is not clipped.
 *
 * The microphone is owned by the shared `MicStreamGraph`, so this source never
 * opens a second `getUserMedia` stream on the same device.
 */

import { frameRms as rms } from '../shared/rms.js';
import type { MicStreamGraph, MicStreamHandle } from '../mic/stream-graph.js';
import {
  createAudioBatchRecorder,
  encodeWavBlob,
  type AudioBatch,
  type AudioBatchRecorder,
} from '../batch/recorder.js';
import { createSegmenter } from '../vad/segmenter.js';
import { createPreRollBuffer } from '../vad/pre-roll.js';
import type { DictationCapture, UtteranceSource } from '../dictation/session.js';

export type PreviewSourceOptions = {
  /** The shared mic graph that owns the device stream. */
  graph: MicStreamGraph;
  /** Input device; null/omitted = the OS default microphone. */
  deviceId?: string | null;
  /** PCM sample rate (default 16000). */
  sampleRate?: number;
  /** Delivered frame size (default 512 samples). */
  frameSamples?: number;
  /** Audio captured before the wake, prepended to the batch and the preview. */
  prefix?: Float32Array | null;
  /** Keep a rolling pre-roll while the source is idle (ms; 0 disables). */
  preRollMs?: number;
  /** Fired when the accumulated batch duration changes (throttle upstream). */
  onBatchProgress?: (info: { durationMs: number; chunks: number }) => void;
  /**
   * When true (default), the VAD segments the audio into an audio batch. Set
   * false for a "live only" surface that has no use for the raw audio.
   */
  recordBatch?: boolean;
};

export type PreviewSource = UtteranceSource & {
  /**
   * The audio batch recorded so far (a snapshot; does not reset). Null when the
   * batch is disabled or nothing was recorded.
   */
  batch(): AudioBatch | null;
  /** Accumulated batch duration, ms. */
  readonly batchDurationMs: number;
  /** Number of VAD bursts folded into the batch so far. */
  readonly batchChunks: number;
  /** True once at least one speech chunk was recorded. */
  readonly batchAvailable: boolean;
  /** Finish and return the batch (resets the recorder). */
  finishBatch(): AudioBatch | null;
  /** Push a frame from an external stream into the pre-roll (when idle). */
  primePreRoll(frame: Float32Array): void;
  /** Detach the pre-roll buffer and stop priming. */
  dispose(): void;
};

export function createPreviewSource(options: PreviewSourceOptions): PreviewSource {
  const sampleRate = Math.max(8000, Math.round(options.sampleRate ?? 16_000));
  const frameSamples = Math.max(1, options.frameSamples ?? 512);
  const recordBatch = options.recordBatch !== false;
  const preRoll = createPreRollBuffer({ ms: options.preRollMs ?? 0, sampleRate });
  let batch: AudioBatchRecorder = createAudioBatchRecorder({
    sampleRate,
    onProgress: options.onBatchProgress,
  });
  let disposed = false;

  return {
    async start(onLevel): Promise<DictationCapture> {
      const segmenter = recordBatch
        ? createSegmenter({
            sampleRate,
            onSegment: (segment) => {
              batch.append({ pcm: segment.pcm, durationMs: segment.pcm.length / (sampleRate / 1000) });
            },
          })
        : null;

      // Seed the pre-roll prefix before any live frame arrives so the batch and
      // the preview both start at the true beginning of the utterance.
      const prefix = options.prefix ?? preRoll.drain();
      const previewChunks: Float32Array[] = [];
      let previewSamples = 0;
      if (prefix && prefix.length) {
        previewChunks.push(prefix);
        previewSamples += prefix.length;
        if (recordBatch) {
          batch.append({ pcm: prefix, durationMs: prefix.length / (sampleRate / 1000) });
        }
      }

      // The level clock: the newest frame's RMS is stored on every callback and
      // emitted on a fixed cadence, so the dictation controller's trailing-silence
      // detection runs on a steady ~25fps timeline independent of the audio block
      // size. A prefix seeds the timeline so speech that began before the wake is
      // accounted for.
      let currentLevel = prefix && prefix.length ? rms(prefix) * 3 : 0;
      let levelTimer: ReturnType<typeof setInterval> | null = setInterval(
        () => onLevel(currentLevel),
        40,
      );

      const handle: MicStreamHandle = await options.graph.acquire({
        deviceId: options.deviceId ?? null,
        frameSamples,
        preferredSampleRate: sampleRate,
        onFrame: (frame) => {
          previewChunks.push(frame);
          previewSamples += frame.length;
          currentLevel = rms(frame) * 3;
          segmenter?.push(frame, Date.now());
        },
      });

      if (!handle.active) {
        // The graph could not open (permission/missing device). The level stays
        // at 0 so the dictation controller's no-speech timeout fires cleanly.
        currentLevel = 0;
      }

      /** Copy of everything captured so far (prefix + live frames), contiguous. */
      const previewPcm = (): Float32Array => {
        if (previewSamples === 0) return new Float32Array(0);
        const pcm = new Float32Array(previewSamples);
        let offset = 0;
        for (const chunk of previewChunks) {
          pcm.set(chunk, offset);
          offset += chunk.length;
        }
        return pcm;
      };

      let stopped = false;
      const teardown = () => {
        if (levelTimer) {
          clearInterval(levelTimer);
          levelTimer = null;
        }
        handle.release();
      };
      return {
        stop: async () => {
          if (!stopped) {
            stopped = true;
            teardown();
          }
          // Close the VAD segment so a still-open tail is counted in the batch.
          segmenter?.flush();
          // A WAV Blob is what a cloud/HTTP STT endpoint expects; a local engine
          // normally consumes the PCM directly (see `pcmSnapshot`).
          return encodeWavBlob(previewPcm(), sampleRate);
        },
        cancel: () => {
          stopped = true;
          teardown();
        },
        // The preview prefers raw PCM so a local engine skips the WAV round-trip.
        pcmSnapshot: () => {
          const pcm = previewPcm();
          return pcm.length ? pcm : null;
        },
        // A WAV blob of the audio so far, for a cloud/HTTP engine that only takes
        // a file (its live preview path). The local engine uses `pcmSnapshot`.
        snapshot: async () => {
          const pcm = previewPcm();
          return pcm.length ? encodeWavBlob(pcm, sampleRate) : null;
        },
      };
    },
    batch() {
      return batch.snapshot();
    },
    get batchDurationMs() {
      return batch.durationMs;
    },
    get batchChunks() {
      return batch.chunks;
    },
    get batchAvailable() {
      return batch.hasAudio;
    },
    finishBatch() {
      return batch.finish();
    },
    primePreRoll(frame) {
      if (disposed) return;
      preRoll.push(frame);
    },
    dispose() {
      disposed = true;
      preRoll.clear();
      batch.reset();
    },
  };
}

/** True when a Blob carries audio the transcriber can consume. */
export function hasAudio(blob: Blob | null | undefined): boolean {
  return Boolean(blob && blob.size > 0);
}
