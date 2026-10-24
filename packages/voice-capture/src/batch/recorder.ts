/**
 * Audio batch recorder (pure orchestration + Blob assembly).
 *
 * The dual-mode capture keeps a *whole* audio recording of a wake turn alive in
 * parallel with the live STT preview, so the user can always fall back to sending
 * the audio itself (cloud / custom STT, or a higher-quality offline pass) rather
 * than trusting an on-device transcript.
 *
 * A wake turn can contain several VAD-separated bursts ("Xeni … do the thing").
 * The recorder concatenates them into **one** batch until a real end (submit, the
 * session timeout, or a long silence), so the user gets a single voice message
 * rather than one per sentence.
 *
 * The Blob assembly is DOM-light (`Blob` only) and the timing is injectable, so
 * the concatenation/cut policy is unit-testable without a microphone.
 */

export type VADChunk = {
  /** PCM of one VAD-detected chunk (16 kHz mono). */
  pcm: Float32Array;
  /** Chunk duration, ms. */
  durationMs: number;
};

export type AudioBatchRecorderOptions = {
  /** Sample rate of the appended PCM (default 16000). */
  sampleRate?: number;
  /**
   * Silence that separates "same input" from "new input" (default 2500 ms).
   * A chunk arriving within this window of the previous one is appended to the
   * same batch; a longer gap still appends (the batch runs until an explicit
   * end) but is tracked so the UI can show the number of bursts.
   */
  gapMs?: number;
  /** Fired whenever the accumulated duration changes. */
  onProgress?: (info: { durationMs: number; chunks: number }) => void;
  /** Clock, injectable for tests. */
  now?: () => number;
};

export type AudioBatch = {
  /** Concatenated PCM of every appended chunk. */
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
  /** Number of VAD bursts folded into this batch. */
  chunks: number;
};

export type AudioBatchRecorder = {
  /** Append one VAD chunk to the running batch. */
  append(chunk: VADChunk): void;
  /** Current accumulated duration, ms (0 before any chunk). */
  readonly durationMs: number;
  /** Number of chunks appended so far. */
  readonly chunks: number;
  /** True when at least one chunk with audio was appended. */
  readonly hasAudio: boolean;
  /** The batch so far, or null when empty. Does not reset. */
  snapshot(): AudioBatch | null;
  /**
   * Finish the batch: return it and reset. Returns null when nothing was
   * recorded, so a caller can distinguish "silence" from "audio".
   */
  finish(): AudioBatch | null;
  /** Drop everything. */
  reset(): void;
  /** Encode the batch as a WAV Blob for transcription by a normal STT path. */
  toBlob(batch?: AudioBatch): Blob | null;
};

export function createAudioBatchRecorder(options: AudioBatchRecorderOptions = {}): AudioBatchRecorder {
  const sampleRate = Math.max(8000, Math.round(options.sampleRate ?? 16_000));
  let chunks: VADChunk[] = [];
  let totalSamples = 0;
  let durationMs = 0;

  function concat(): AudioBatch | null {
    if (chunks.length === 0 || totalSamples === 0) return null;
    const pcm = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk.pcm, offset);
      offset += chunk.pcm.length;
    }
    return { pcm, sampleRate, durationMs, chunks: chunks.length };
  }

  return {
    append(chunk) {
      if (!chunk.pcm.length) return;
      chunks.push({ pcm: chunk.pcm.slice(), durationMs: chunk.durationMs });
      totalSamples += chunk.pcm.length;
      durationMs += chunk.durationMs;
      options.onProgress?.({ durationMs, chunks: chunks.length });
    },
    get durationMs() {
      return durationMs;
    },
    get chunks() {
      return chunks.length;
    },
    get hasAudio() {
      return totalSamples > 0;
    },
    snapshot() {
      return concat();
    },
    finish() {
      const out = concat();
      chunks = [];
      totalSamples = 0;
      durationMs = 0;
      return out;
    },
    reset() {
      chunks = [];
      totalSamples = 0;
      durationMs = 0;
    },
    toBlob(batch) {
      const target = batch ?? concat();
      if (!target || !target.pcm.length) return null;
      return encodeWavBlob(target.pcm, target.sampleRate);
    },
  };
}

/** Encode mono Float32 PCM as a 16-bit PCM WAV Blob (in memory). */
export function encodeWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]!));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
