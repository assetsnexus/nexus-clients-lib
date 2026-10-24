import { describe, expect, it, vi } from 'vitest';
import { createSegmenter, type Segment } from './segmenter.js';

const RATE = 16_000;
/** One 512-sample frame of roughly `level` amplitude. */
function frame(level: number, samples = 512): Float32Array {
  const out = new Float32Array(samples);
  out.fill(level);
  return out;
}

function collect(): { segments: Segment[]; segmenter: ReturnType<typeof createSegmenter> } {
  const segments: Segment[] = [];
  const segmenter = createSegmenter({ sampleRate: RATE, onSegment: (s) => segments.push(s) });
  return { segments, segmenter };
}

describe('createSegmenter', () => {
  it('ignores pure silence (no segment fabricated)', () => {
    const { segments, segmenter } = collect();
    for (let i = 0; i < 50; i++) segmenter.push(frame(0.001), i * 32);
    expect(segments).toHaveLength(0);
    expect(segmenter.open).toBe(false);
  });

  it('emits one segment after speech followed by trailing silence', () => {
    const { segments, segmenter } = collect();
    // ~640ms of speech (20 frames @ 512/16000 = 32ms each) then silence.
    for (let i = 0; i < 20; i++) segmenter.push(frame(0.2), i * 32);
    for (let i = 20; i < 40; i++) segmenter.push(frame(0.001), i * 32);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.speechMs).toBeGreaterThan(500);
    expect(segments[0]!.sampleRate).toBe(RATE);
    expect(segments[0]!.index).toBe(0);
  });

  it('drops a segment shorter than minSpeechMs', () => {
    const segments: Segment[] = [];
    const segmenter = createSegmenter({
      sampleRate: RATE,
      minSpeechMs: 300,
      onSegment: (s) => segments.push(s),
    });
    segmenter.push(frame(0.2), 0); // 32ms of speech, then silence
    for (let i = 1; i < 30; i++) segmenter.push(frame(0.001), i * 32);
    expect(segments).toHaveLength(0);
  });

  it('caps a segment at maxSegmentMs even without silence', () => {
    const segments: Segment[] = [];
    const segmenter = createSegmenter({
      sampleRate: RATE,
      minSpeechMs: 50,
      maxSegmentMs: 100,
      onSegment: (s) => segments.push(s),
    });
    for (let i = 0; i < 10; i++) segmenter.push(frame(0.2), i * 32);
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segmenter.open).toBe(true);
  });

  it('flush emits the open segment and then clears it', () => {
    const { segments, segmenter } = collect();
    for (let i = 0; i < 20; i++) segmenter.push(frame(0.2), i * 32);
    segmenter.flush();
    expect(segments).toHaveLength(1);
    segmenter.flush();
    expect(segments).toHaveLength(1);
  });

  it('reports frames to onFrame for a meter', () => {
    const onFrame = vi.fn();
    const segmenter = createSegmenter({ sampleRate: RATE, onSegment: () => {}, onFrame });
    segmenter.push(frame(0.5), 0);
    expect(onFrame).toHaveBeenCalledWith({ rms: 0.5, sawSpeech: false, speechMs: 0 });
  });

  it('setSampleRate changes segment timing', () => {
    const { segments, segmenter } = collect();
    segmenter.setSampleRate(8_000);
    // 512 samples at 8k = 64ms per frame; 6 frames = 384ms speech.
    for (let i = 0; i < 6; i++) segmenter.push(frame(0.2), i * 64);
    segmenter.flush();
    expect(segments[0]!.speechMs).toBeCloseTo(384, 5);
    expect(segments[0]!.sampleRate).toBe(8_000);
  });

  it('reset drops buffered audio without emitting', () => {
    const { segments, segmenter } = collect();
    for (let i = 0; i < 20; i++) segmenter.push(frame(0.2), i * 32);
    segmenter.reset();
    expect(segmenter.open).toBe(false);
    for (let i = 0; i < 20; i++) segmenter.push(frame(0.001), i * 32);
    expect(segments).toHaveLength(0);
  });
});
