import { describe, expect, it } from 'vitest';
import { createPreRollBuffer } from './pre-roll.js';

function ramp(start: number, count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = start + i;
  return out;
}

describe('createPreRollBuffer', () => {
  it('keeps only the window and drains oldest-first', () => {
    // 16_000 samples capacity at 16 kHz = 1s window.
    const buffer = createPreRollBuffer({ ms: 1000, sampleRate: 16_000 });
    buffer.push(ramp(0, 10_000));
    buffer.push(ramp(10_000, 10_000));
    const drained = buffer.drain();
    // Only the last 16_000 samples survive, so the first 4_000 are dropped.
    expect(drained).not.toBeNull();
    expect(drained!.length).toBe(16_000);
    expect(drained![0]).toBe(4_000);
    expect(drained![15_999]).toBe(19_999);
  });

  it('drain empties the buffer', () => {
    const buffer = createPreRollBuffer({ ms: 1000, sampleRate: 16_000 });
    buffer.push(ramp(0, 100));
    expect(buffer.drain()).not.toBeNull();
    expect(buffer.drain()).toBeNull();
  });

  it('peek does not empty the buffer', () => {
    const buffer = createPreRollBuffer({ ms: 1000, sampleRate: 16_000 });
    buffer.push(ramp(0, 100));
    expect(buffer.peek()!.length).toBe(100);
    expect(buffer.peek()!.length).toBe(100);
  });

  it('reports duration and clears', () => {
    const buffer = createPreRollBuffer({ ms: 1000, sampleRate: 16_000 });
    buffer.push(ramp(0, 8_000));
    expect(buffer.durationMs).toBeCloseTo(500, 5);
    buffer.clear();
    expect(buffer.durationMs).toBe(0);
  });

  it('is inert when the window is zero', () => {
    const buffer = createPreRollBuffer({ ms: 0, sampleRate: 16_000 });
    buffer.push(ramp(0, 100));
    expect(buffer.peek()).toBeNull();
  });
});
