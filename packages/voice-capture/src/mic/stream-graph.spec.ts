import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMicStreamGraph } from './stream-graph.js';

/** Processors created by the fake context, so tests can drive audio callbacks. */
const processors: FakeProcessor[] = [];

class FakeProcessor {
  onaudioprocess: ((event: unknown) => void) | null = null;
  constructor() {
    processors.push(this);
  }
  connect() {}
  disconnect() {
    this.onaudioprocess = null;
  }
}

class FakeGain {
  gain = { value: 1 };
  connect() {}
  disconnect() {}
}

class FakeAnalyser {
  fftSize = 512;
  connect() {}
  disconnect() {}
  getFloatTimeDomainData() {}
}

class FakeAudioContext {
  sampleRate = 16_000;
  destination = {};
  createMediaStreamSource() {
    return { connect() {} };
  }
  createScriptProcessor() {
    return new FakeProcessor();
  }
  createGain() {
    return new FakeGain();
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
  close() {
    return Promise.resolve();
  }
}

/** Emit one 1024-sample block through the most recent processor. */
function emitBlock(amplitude: number): void {
  const proc = processors.at(-1);
  if (!proc) throw new Error('no processor');
  const input = new Float32Array(1024);
  input.fill(amplitude);
  proc.onaudioprocess?.({ inputBuffer: { getChannelData: () => input } });
}

describe('createMicStreamGraph', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  const track = { stop: vi.fn() };

  beforeEach(() => {
    processors.length = 0;
    track.stop = vi.fn();
    getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
    Object.defineProperty(globalThis, 'AudioContext', {
      value: FakeAudioContext,
      configurable: true,
      writable: true,
    });
    // Node exposes `navigator` as a getter-only property, so it must be replaced
    // with `defineProperty` rather than assigned.
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia } },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
  });

  it('opens exactly one stream for many subscribers on the same device', async () => {
    const graph = createMicStreamGraph();
    const a = await graph.acquire({ onFrame: () => {} });
    const b = await graph.acquire({ onFrame: () => {} });
    const c = await graph.acquire({ onFrame: () => {} });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(graph.size).toBe(1);
    expect(a.active && b.active && c.active).toBe(true);
  });

  it('closes the device on the last release', async () => {
    const graph = createMicStreamGraph();
    const a = await graph.acquire({ onFrame: () => {} });
    const b = await graph.acquire({ onFrame: () => {} });
    a.release();
    expect(graph.size).toBe(1);
    expect(track.stop).not.toHaveBeenCalled();
    b.release();
    expect(graph.size).toBe(0);
    expect(track.stop).toHaveBeenCalled();
  });

  it('opens a separate stream per device id', async () => {
    const graph = createMicStreamGraph();
    await graph.acquire({ deviceId: 'mic-1', onFrame: () => {} });
    await graph.acquire({ deviceId: 'mic-2', onFrame: () => {} });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(graph.keys().sort()).toEqual(['device:mic-1', 'device:mic-2']);
  });

  it('fans contiguous fixed-size frames out to every subscriber', async () => {
    const graph = createMicStreamGraph();
    const a: Float32Array[] = [];
    const b: Float32Array[] = [];
    await graph.acquire({ frameSamples: 512, onFrame: (f) => a.push(f) });
    await graph.acquire({ frameSamples: 512, onFrame: (f) => b.push(f) });
    emitBlock(0.3);
    // One 1024-sample block becomes two 512-sample frames for each subscriber.
    expect(a.length).toBe(2);
    expect(b.length).toBe(2);
    expect(a[0]!.length).toBe(512);
    expect(a[0]![0]).toBeCloseTo(0.3, 5);
  });

  it('reports the live sample rate for a device', async () => {
    const graph = createMicStreamGraph();
    await graph.acquire({ onFrame: () => {} });
    expect(graph.sampleRate()).toBe(16_000);
    expect(graph.sampleRate('nope')).toBeNull();
  });

  it('stopAll closes every device and drops subscribers', async () => {
    const graph = createMicStreamGraph();
    await graph.acquire({ onFrame: () => {} });
    await graph.acquire({ deviceId: 'mic-1', onFrame: () => {} });
    graph.stopAll();
    expect(graph.size).toBe(0);
    expect(track.stop).toHaveBeenCalledTimes(2);
  });

  it('degrades to an inert handle when the device cannot open', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('denied'));
    const graph = createMicStreamGraph();
    const handle = await graph.acquire({ onFrame: () => {} });
    expect(handle.active).toBe(false);
    expect(graph.size).toBe(0);
  });
});
