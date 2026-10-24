import { describe, expect, it, vi } from 'vitest';
import { createPreviewSource } from './preview-source.js';
import type { MicStreamGraph, MicStreamHandle } from '../mic/stream-graph.js';

/** A graph whose frames are pushed manually. */
function fakeGraph(): {
  graph: MicStreamGraph;
  push: (frame: Float32Array, deviceId?: string | null) => void;
  released: ReturnType<typeof vi.fn>;
} {
  const subscribers = new Map<string, (frame: Float32Array) => void>();
  const released = vi.fn();
  let key = 'default';
  const graph: MicStreamGraph = {
    async acquire(options): Promise<MicStreamHandle> {
      key = options.deviceId ? `device:${options.deviceId}` : 'default';
      subscribers.set(key, options.onFrame);
      return {
        sampleRate: 16_000,
        frameSamples: 512,
        active: true,
        release() {
          subscribers.delete(key);
          released();
        },
      };
    },
    sampleRate: () => 16_000,
    size: 1,
    keys: () => [...subscribers.keys()],
    stopAll() {
      subscribers.clear();
    },
  };
  return {
    graph,
    push: (frame, deviceId = null) => {
      const k = deviceId ? `device:${deviceId}` : 'default';
      subscribers.get(k)?.(frame);
    },
    released,
  };
}

function speech(n: number): Float32Array {
  const out = new Float32Array(n);
  out.fill(0.4);
  return out;
}
function silence(n: number): Float32Array {
  return new Float32Array(n);
}

describe('createPreviewSource', () => {
  it('records VAD chunks into a single audio batch', async () => {
    const { graph, push } = fakeGraph();
    const source = createPreviewSource({ graph });
    const levels: number[] = [];
    await source.start((l) => levels.push(l));
    // Two speech bursts separated by silence.
    for (let i = 0; i < 12; i++) push(speech(512));
    for (let i = 0; i < 20; i++) push(silence(512));
    for (let i = 0; i < 12; i++) push(speech(512));
    for (let i = 0; i < 20; i++) push(silence(512));
    const batch = source.batch();
    expect(batch).not.toBeNull();
    expect(batch!.chunks).toBeGreaterThanOrEqual(1);
    expect(source.batchAvailable).toBe(true);
    source.dispose();
  });

  it('seeds the batch with a pre-roll prefix', async () => {
    const { graph } = fakeGraph();
    const prefix = speech(512);
    const source = createPreviewSource({ graph, prefix });
    await source.start(() => {});
    const batch = source.batch();
    expect(batch).not.toBeNull();
    expect(batch!.pcm.length).toBe(512);
    source.dispose();
  });

  it('exposes a live PCM snapshot for the preview', async () => {
    const { graph, push } = fakeGraph();
    const source = createPreviewSource({ graph });
    const capture = await source.start(() => {});
    push(speech(512));
    push(speech(512));
    const pcm = capture.pcmSnapshot?.();
    expect(pcm).not.toBeNull();
    expect(pcm!.length).toBe(1024);
    source.dispose();
  });

  it('releases the shared stream on stop', async () => {
    const { graph, released } = fakeGraph();
    const source = createPreviewSource({ graph });
    const capture = await source.start(() => {});
    await capture.stop();
    expect(released).toHaveBeenCalled();
  });

  it('reports batch progress', async () => {
    const { graph, push } = fakeGraph();
    const onBatchProgress = vi.fn();
    const source = createPreviewSource({ graph, onBatchProgress });
    await source.start(() => {});
    for (let i = 0; i < 12; i++) push(speech(512));
    for (let i = 0; i < 20; i++) push(silence(512));
    expect(onBatchProgress).toHaveBeenCalled();
    source.dispose();
  });

  it('does not record a batch when recordBatch is false', async () => {
    const { graph, push } = fakeGraph();
    const source = createPreviewSource({ graph, recordBatch: false });
    await source.start(() => {});
    for (let i = 0; i < 12; i++) push(speech(512));
    for (let i = 0; i < 20; i++) push(silence(512));
    expect(source.batchAvailable).toBe(false);
    source.dispose();
  });
});
