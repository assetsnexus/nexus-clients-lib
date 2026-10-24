/**
 * Shared microphone stream graph.
 *
 * Every browser capture feature needs the same thing: contiguous 16 kHz mono
 * PCM frames from a microphone. The naive approach is one `getUserMedia` +
 * `AudioContext` per feature, so an app that listens for wake words, dictates an
 * utterance and draws a level meter holds three independent capture streams on
 * the same physical device — wasteful, and a common source of "device busy" /
 * echo / permission churn.
 *
 * This module owns **exactly one** stream per device id and fans the frames out
 * to every interested subscriber (wake detection, dictation capture, meter).
 * Subscribers are ref-counted: the stream is opened on the first acquire and
 * released when the last handle is released.
 *
 * Frames are delivered **contiguously** (no dropped samples), which the STT
 * segmenter needs — it transcribes whole speech segments, so gaps would corrupt
 * the audio it sends to the local speech model. The preferred path is a
 * `ScriptProcessorNode` with a fallback to analyser polling. Capture is
 * requested at 16 kHz so the sample rate the STT engine reports matches what the
 * model expects; audio is re-chunked into fixed-size frames so the cadence is
 * deterministic regardless of the browser's block size.
 *
 * TRUST: this never records to disk and never sends audio anywhere. Frames only
 * reach the subscribers that asked for them.
 */

import { frameRms } from '../shared/rms.js';

type AudioGlobals = {
  navigator?: {
    mediaDevices?: { getUserMedia?: (c: Record<string, unknown>) => Promise<MediaStream> };
  };
  AudioContext?: new (options?: { sampleRate?: number }) => AudioContext;
  webkitAudioContext?: new (options?: { sampleRate?: number }) => AudioContext;
};

const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_FRAME_SAMPLES = 512;

export type MicAcquireOptions = {
  /** Specific input device (`MediaDeviceInfo.deviceId`); null/omitted = OS default. */
  deviceId?: string | null;
  /** Called with contiguous PCM frames until the handle is released. */
  onFrame: (frame: Float32Array) => void;
  /** Frames per second for the analyser fallback (default 30). */
  framesPerSecond?: number;
  /** Preferred delivered frame size (default 512 samples). */
  frameSamples?: number;
  /** Preferred capture rate; the browser resamples the mic to this (default 16000). */
  preferredSampleRate?: number;
};

export type MicStreamHandle = {
  /** Sample rate of the delivered frames (Hz). */
  readonly sampleRate: number;
  /** Frame size delivered to `onFrame` (samples). */
  readonly frameSamples: number;
  /** True while frames are still being delivered. */
  readonly active: boolean;
  /** Release this subscriber; the device stream closes on the last release. */
  release(): void;
};

export type MicStreamGraph = {
  /**
   * Subscribe to a device's frames, opening the stream if needed. Resolves with
   * a handle whose `release()` detaches this subscriber.
   */
  acquire(options: MicAcquireOptions): Promise<MicStreamHandle>;
  /** The current sample rate for a device, or null when it is not open. */
  sampleRate(deviceId?: string | null): number | null;
  /** Number of live streams (one per open device). */
  readonly size: number;
  /** The device keys currently open (the OS default key is `default`). */
  keys(): string[];
  /** Force-close every stream and drop all subscribers. */
  stopAll(): void;
};

type Subscriber = { onFrame: (frame: Float32Array) => void };

type DeviceEntry = {
  key: string;
  deviceId: string | null;
  stream: MediaStream | null;
  context: AudioContext | null;
  processor: ScriptProcessorNode | null;
  sink: GainNode | null;
  timer: ReturnType<typeof setInterval> | null;
  analyser: AnalyserNode | null;
  buffer: Float32Array | null;
  sampleRate: number;
  frameSamples: number;
  subscribers: Set<Subscriber>;
  /** Fixed-size frame accumulator shared by every subscriber. */
  pending: Float32Array[];
  pendingSamples: number;
};

/** The device key for a null/undefined device id (the OS default). */
function deviceKey(deviceId: string | null | undefined): string {
  return deviceId ? `device:${deviceId}` : 'default';
}

function audioGlobals(): AudioGlobals {
  return globalThis as unknown as AudioGlobals;
}

export function createMicStreamGraph(): MicStreamGraph {
  const devices = new Map<string, DeviceEntry>();

  /** Emit fixed-size frames to every subscriber, buffering the remainder. */
  function deliver(entry: DeviceEntry, chunk: Float32Array): void {
    if (entry.subscribers.size === 0 || chunk.length === 0) return;
    const size = entry.frameSamples;
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(size - entry.pendingSamples, chunk.length - offset);
      entry.pending.push(chunk.subarray(offset, offset + take));
      entry.pendingSamples += take;
      offset += take;
      if (entry.pendingSamples < size) break;
      let frame: Float32Array;
      if (entry.pending.length === 1) {
        frame = entry.pending[0]!;
      } else {
        frame = new Float32Array(size);
        let o = 0;
        for (const part of entry.pending) {
          frame.set(part, o);
          o += part.length;
        }
      }
      entry.pending = [];
      entry.pendingSamples = 0;
      for (const sub of entry.subscribers) sub.onFrame(frame);
    }
  }

  function teardown(entry: DeviceEntry): void {
    if (entry.timer) {
      clearInterval(entry.timer);
      entry.timer = null;
    }
    if (entry.processor) {
      entry.processor.onaudioprocess = null;
      try {
        entry.processor.disconnect();
      } catch {
        /* ignore */
      }
      entry.processor = null;
    }
    try {
      entry.sink?.disconnect();
    } catch {
      /* ignore */
    }
    entry.sink = null;
    try {
      entry.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    entry.analyser = null;
    try {
      entry.stream?.getTracks?.().forEach((track) => track.stop());
    } catch {
      /* ignore */
    }
    entry.stream = null;
    try {
      void entry.context?.close?.();
    } catch {
      /* ignore */
    }
    entry.context = null;
    entry.buffer = null;
    entry.pending = [];
    entry.pendingSamples = 0;
    entry.subscribers.clear();
    devices.delete(entry.key);
  }

  async function openDevice(
    key: string,
    deviceId: string | null,
    options: { preferredSampleRate: number; framesPerSecond: number; frameSamples: number },
  ): Promise<DeviceEntry | null> {
    const g = audioGlobals();
    const mediaDevices = g.navigator?.mediaDevices;
    // Bind to `mediaDevices`: extracting the method first loses its `this`, and
    // Chromium throws "Illegal invocation" for a detached `getUserMedia` call.
    const getUserMedia = mediaDevices?.getUserMedia?.bind(mediaDevices);
    const Ctor = g.AudioContext || g.webkitAudioContext;
    if (!getUserMedia || !Ctor) return null;
    const intervalMs = Math.max(10, Math.round(1000 / options.framesPerSecond));
    const entry: DeviceEntry = {
      key,
      deviceId,
      stream: null,
      context: null,
      processor: null,
      sink: null,
      timer: null,
      analyser: null,
      buffer: null,
      sampleRate: options.preferredSampleRate,
      frameSamples: options.frameSamples,
      subscribers: new Set(),
      pending: [],
      pendingSamples: 0,
    };
    try {
      entry.stream = await getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      let context: AudioContext;
      try {
        context = new Ctor({ sampleRate: options.preferredSampleRate });
      } catch {
        context = new Ctor();
      }
      entry.context = context;
      entry.sampleRate = Math.round(context.sampleRate) || options.preferredSampleRate;
      const source = context.createMediaStreamSource(entry.stream);

      // Preferred: contiguous frames with no dropped samples.
      const createProcessor = context.createScriptProcessor?.bind(context);
      if (typeof createProcessor === 'function') {
        const processor = createProcessor(1024, 1, 1);
        processor.onaudioprocess = (event) => {
          if (devices.get(key) !== entry) return;
          // Copy: the input buffer is reused between callbacks.
          const channel = event.inputBuffer.getChannelData(0);
          deliver(entry, new Float32Array(channel));
        };
        source.connect(processor);
        // A muted sink keeps the processor pulling without echoing to speakers.
        const sink = context.createGain();
        sink.gain.value = 0;
        processor.connect(sink);
        sink.connect(context.destination);
        entry.processor = processor;
        entry.sink = sink;
        devices.set(key, entry);
        return entry;
      }

      // Fallback: analyser polling (may drop samples between ticks).
      const analyser = context.createAnalyser();
      analyser.fftSize = Math.max(256, 512);
      source.connect(analyser);
      entry.analyser = analyser;
      entry.buffer = new Float32Array(analyser.fftSize);
      entry.timer = setInterval(() => {
        if (devices.get(key) !== entry || !entry.analyser || !entry.buffer) return;
        entry.analyser.getFloatTimeDomainData(entry.buffer as Float32Array<ArrayBuffer>);
        deliver(entry, entry.buffer);
      }, intervalMs);
      devices.set(key, entry);
      return entry;
    } catch {
      teardown(entry);
      return null;
    }
  }

  return {
    async acquire(options) {
      const deviceId = options.deviceId ?? null;
      const key = deviceKey(deviceId);
      const preferredSampleRate = options.preferredSampleRate ?? DEFAULT_SAMPLE_RATE;
      const framesPerSecond = options.framesPerSecond ?? 30;
      const frameSamples = Math.max(1, options.frameSamples ?? DEFAULT_FRAME_SAMPLES);
      let entry = devices.get(key);
      if (!entry) {
        entry = (await openDevice(key, deviceId, {
          preferredSampleRate,
          framesPerSecond,
          frameSamples,
        })) as DeviceEntry;
      }
      if (!entry || !devices.has(key)) {
        // Could not open: hand back an inert handle so callers degrade cleanly.
        return {
          sampleRate: preferredSampleRate,
          frameSamples,
          active: false,
          release() {
            /* nothing to release */
          },
        };
      }
      const subscriber: Subscriber = { onFrame: options.onFrame };
      entry.subscribers.add(subscriber);
      const device = entry;
      let released = false;
      return {
        get sampleRate() {
          return device.sampleRate;
        },
        get frameSamples() {
          return device.frameSamples;
        },
        get active() {
          return !released && devices.get(key) === device;
        },
        release() {
          if (released) return;
          released = true;
          device.subscribers.delete(subscriber);
          if (device.subscribers.size === 0) teardown(device);
        },
      };
    },
    sampleRate(deviceId) {
      return devices.get(deviceKey(deviceId))?.sampleRate ?? null;
    },
    get size() {
      return devices.size;
    },
    keys() {
      return [...devices.keys()];
    },
    stopAll() {
      for (const entry of [...devices.values()]) teardown(entry);
    },
  };
}

/** Exported for callers that want the same silence gate as the segmenter. */
export { frameRms };
