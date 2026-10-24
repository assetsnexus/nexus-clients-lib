import { describe, expect, it, vi } from 'vitest';
import { createAudioBatchRecorder, encodeWavBlob } from './recorder.js';

function pcm(count: number, value = 0.5): Float32Array {
  const out = new Float32Array(count);
  out.fill(value);
  return out;
}

describe('createAudioBatchRecorder', () => {
  it('concatenates multiple VAD chunks into one batch', () => {
    const recorder = createAudioBatchRecorder({ sampleRate: 16_000 });
    recorder.append({ pcm: pcm(1600), durationMs: 100 });
    recorder.append({ pcm: pcm(3200), durationMs: 200 });
    const batch = recorder.snapshot();
    expect(batch).not.toBeNull();
    expect(batch!.pcm.length).toBe(4800);
    expect(batch!.durationMs).toBe(300);
    expect(batch!.chunks).toBe(2);
    expect(recorder.hasAudio).toBe(true);
  });

  it('reports progress as chunks arrive', () => {
    const onProgress = vi.fn();
    const recorder = createAudioBatchRecorder({ sampleRate: 16_000, onProgress });
    recorder.append({ pcm: pcm(1600), durationMs: 100 });
    expect(onProgress).toHaveBeenCalledWith({ durationMs: 100, chunks: 1 });
  });

  it('returns null from finish when nothing was recorded', () => {
    const recorder = createAudioBatchRecorder();
    expect(recorder.finish()).toBeNull();
    expect(recorder.hasAudio).toBe(false);
  });

  it('finish returns the batch and resets', () => {
    const recorder = createAudioBatchRecorder({ sampleRate: 16_000 });
    recorder.append({ pcm: pcm(1600), durationMs: 100 });
    const batch = recorder.finish();
    expect(batch!.chunks).toBe(1);
    expect(recorder.durationMs).toBe(0);
    expect(recorder.snapshot()).toBeNull();
  });

  it('ignores empty chunks', () => {
    const recorder = createAudioBatchRecorder();
    recorder.append({ pcm: new Float32Array(0), durationMs: 0 });
    expect(recorder.hasAudio).toBe(false);
  });
});

describe('encodeWavBlob', () => {
  it('writes a valid 16-bit mono PCM header', async () => {
    const blob = encodeWavBlob(pcm(4), 16_000);
    const view = new DataView(await blob.arrayBuffer());
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(blob.size).toBe(44 + 8);
  });
});
