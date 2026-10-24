/**
 * Optional Silero VAD adapter.
 *
 * The energy segmenter in `./segmenter.ts` is the portable default: no model, no
 * WASM download, deterministic in tests. For environments that want a trained
 * VAD (better rejection of keyboard noise, breathing, music), this adapter wraps
 * a host-supplied Silero session behind the same `Segmenter` interface so callers
 * can swap engines without changing their pipeline.
 *
 * The Silero implementation itself is injected (`createSession`) rather than
 * imported, so this package keeps zero runtime dependencies and stays usable in
 * Node/tests. A browser host typically passes `@ricky0123/vad-web`'s `MicVAD`.
 */

import { createSegmenter, type Segmenter, type SegmenterOptions } from './segmenter.js';

/** A Silero session emitting speech-start / speech-end PCM (16 kHz mono). */
export type SileroSession = {
  start(): Promise<void>;
  stop(): void;
  /** Called when a speech segment ends; receives its PCM. */
  onSpeechEnd?: (pcm: Float32Array) => void;
  /** Called once when speech starts (optional, for a live indicator). */
  onSpeechStart?: () => void;
};

export type SileroAdapterOptions = SegmenterOptions & {
  /** Build the underlying Silero session (host-injected). */
  createSession: (callbacks: {
    onSpeechStart: () => void;
    onSpeechEnd: (pcm: Float32Array) => void;
    onError: (err: unknown) => void;
  }) => Promise<SileroSession> | SileroSession;
};

export type SileroSegmenter = Segmenter & {
  /** Open the Silero session and begin detecting. */
  start(): Promise<boolean>;
  /** Tear the Silero session down. */
  dispose(): void;
};

/**
 * Wrap a host-supplied Silero session as a `Segmenter`. Frames pushed to the
 * returned segmenter are ignored — Silero owns the microphone and reports whole
 * segments — but the interface stays identical so callers can swap VADs.
 */
export function createSileroSegmenter(options: SileroAdapterOptions): SileroSegmenter {
  // The energy segmenter is used only for its `flush`/`reset`/`setSampleRate`
  // bookkeeping surface; segments come from Silero's callbacks.
  const passthrough = createSegmenter({ ...options, onSegment: () => undefined });
  let session: SileroSession | null = null;
  let active = false;

  const emitPcm = (pcm: Float32Array) => {
    if (!pcm.length) return;
    options.onSegment({
      pcm,
      // Silero does not report speech duration; approximate from length.
      speechMs: (pcm.length / Math.max(8000, options.sampleRate)) * 1000,
      sampleRate: Math.max(8000, options.sampleRate),
      index: 0,
    });
  };

  return {
    get open() {
      return active;
    },
    async start() {
      try {
        session = await options.createSession({
          onSpeechStart: () => {
            active = true;
          },
          onSpeechEnd: (pcm) => {
            active = false;
            emitPcm(pcm);
          },
          onError: () => {
            active = false;
          },
        });
        await session.start();
        return true;
      } catch {
        session = null;
        active = false;
        return false;
      }
    },
    dispose() {
      try {
        session?.stop();
      } catch {
        /* ignore */
      }
      session = null;
      active = false;
      passthrough.reset();
    },
    push() {
      // Frames are owned by Silero; nothing to do here.
    },
    setSampleRate: passthrough.setSampleRate,
    flush: passthrough.flush,
    reset: passthrough.reset,
  };
}
