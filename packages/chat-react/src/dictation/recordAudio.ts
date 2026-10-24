import type { IoDescriptor } from '@nexus/chat-core';
import { DictationFailure, micFailureCode } from './dictationOutcome.js';

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
}

/**
 * The slice of `MediaRecorder` the capture lifecycle actually uses. Declared
 * structurally so the stop/cancel idempotency is unit-testable in Node, where
 * there is no `MediaRecorder`; the real instance satisfies it.
 */
export type MediaRecorderLike = {
  readonly state: string;
  readonly mimeType?: string;
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
};

export type MicCapture = {
  /**
   * Stop the recorder and resolve the encoded audio. Idempotent: a second call
   * (or a call after `cancel()`) returns the same blob instead of stopping an
   * already-inactive recorder, which yields zero bytes.
   */
  stop: () => Promise<Blob>;
  /** Abandon the capture. Idempotent, and safe to call before/after `stop()`. */
  cancel: () => void;
  /** Milliseconds the microphone has been capturing (0 before `start`). */
  elapsedMs: () => number;
};

/**
 * Wire the recorder callbacks into an idempotent capture.
 *
 * The order the composer released the button and the microphone opened is not
 * guaranteed: a press can end while `getUserMedia` is still resolving, so
 * `stop()` can be the *first* thing that happens to a freshly started recorder.
 * Stopping a recorder that has not delivered a frame yet produces a zero-byte
 * blob — the capture must instead resolve with whatever it has, and let the
 * caller decide whether "nothing" is a real failure or a too-short press.
 */
export function createMediaRecorderCapture(input: {
  recorder: MediaRecorderLike;
  /** Releases the device tracks once the capture settles. */
  releaseStream: () => void;
  mimeType: string;
  /** Clock, injectable for tests. */
  now?: () => number;
  onChunk?: (frame: ArrayBuffer) => void;
}): MicCapture {
  const now = input.now ?? (() => Date.now());
  const { recorder, releaseStream, mimeType } = input;
  const chunks: Blob[] = [];
  // The capture is created as the recorder starts, so the window is measured
  // from construction to `stop()`.
  const startedAt = now();
  let resolveSettled: (blob: Blob) => void = () => undefined;
  let rejectSettled: (error: Error) => void = () => undefined;
  // Created eagerly: the recorder's callbacks can fire before the caller ever
  // calls `stop()` (a very short press), and an error must still reject the
  // promise the caller is about to await.
  const settled = new Promise<Blob>((resolve, reject) => {
    resolveSettled = resolve;
    rejectSettled = reject;
  });
  let done = false;
  let stopRequested = false;

  const finish = (error?: Error) => {
    // `onerror` and `onstop` can both fire; settle (and release) exactly once.
    if (done) return;
    done = true;
    releaseStream();
    if (error) rejectSettled(error);
    else resolveSettled(new Blob(chunks, { type: recorder.mimeType || mimeType }));
  };

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
    if (input.onChunk && event.data.size) {
      void event.data
        .arrayBuffer()
        .then((frame) => input.onChunk?.(frame))
        .catch(() => undefined);
    }
  };
  recorder.onerror = () => finish(new Error('Recording failed.'));
  recorder.onstop = () => finish();

  const requestStop = () => {
    if (stopRequested || done) return;
    stopRequested = true;
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Already stopped by the engine: resolve with what we have.
        finish();
      }
    } else {
      // Nothing left to stop (cancelled, or stopped by the engine already).
      finish();
    }
  };

  return {
    stop: () => {
      requestStop();
      return settled;
    },
    cancel: requestStop,
    elapsedMs: () => Math.max(0, now() - startedAt),
  };
}

/**
 * Open the microphone and start encoding. `onChunk` (when supplied) also starts
 * the recorder on a 250 ms timeslice so a live STT socket receives frames while
 * the button is held.
 *
 * The device stream is opened *before* the recorder starts, so the caller's
 * early-release race resolves against a capture that is already live rather
 * than one that has not begun.
 */
export async function startMicCapture(opts?: {
  onChunk?: (frame: ArrayBuffer) => void;
}): Promise<MicCapture> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new DictationFailure('mic-unavailable');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new DictationFailure('mic-unavailable');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new DictationFailure(micFailureCode(error));
  }
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined,
  );
  const capture = createMediaRecorderCapture({
    recorder: recorder as unknown as MediaRecorderLike,
    mimeType,
    releaseStream: () => stream.getTracks().forEach((track) => track.stop()),
    onChunk: opts?.onChunk,
  });
  recorder.start(opts?.onChunk ? 250 : undefined);
  return capture;
}

export async function blobToInlineAudio(blob: Blob, filename: string): Promise<IoDescriptor> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read the recording.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });
  return {
    kind: 'inline',
    mimeType: blob.type || 'audio/webm',
    dataBase64,
    byteLength: blob.size,
    filename,
  };
}
