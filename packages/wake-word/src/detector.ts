/**
 * Wake-word detectors (plan Part W).
 *
 * A detector consumes 16 kHz mono PCM frames and decides whether the phrase
 * fired. Detectors run entirely on-device and hold no network capability.
 *
 * Two implementations ship here:
 *  - {@link createOnnxDetector}: the real openWakeWord ONNX path. It is only
 *    usable when a host-provided ONNX runtime + model bytes are supplied.
 *  - {@link createStubDetector}: NEVER detects. Used so the full wiring can be
 *    exercised while the model artifact is missing; it reports `detecting:false`
 *    and the UI must surface "wake unavailable" rather than silently doing
 *    nothing.
 */

import { frameRms, type WakeAudioFrame } from './audio-source.js';

export type WakeDetectorInput = {
  frame: WakeAudioFrame;
  /** ms timestamp of the frame. */
  at: number;
};

export type WakeDetectorResult = {
  fired: boolean;
  confidence: number | null;
};

export interface WakeWordDetector {
  readonly id: string;
  /** True when this detector can genuinely fire. A stub is always false. */
  readonly detecting: boolean;
  /** Reset internal buffers between activations. */
  reset(): void;
  push(input: WakeDetectorInput): WakeDetectorResult;
}

/**
 * Minimal ONNX runtime surface we rely on. The host injects an implementation
 * (onnxruntime-web / react-native-ort) so this package stays runtime-agnostic.
 */
export type OnnxRuntimeLike = {
  InferenceSession: {
    create(bytes: Uint8Array): Promise<{
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array | number[] }>>;
    }>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

export type OnnxDetectorOptions = {
  id: string;
  modelBytes: Uint8Array;
  runtime: OnnxRuntimeLike;
  /** Feature window in samples fed to the model, default 16 kHz * 1.28s. */
  windowSamples?: number;
  /** Confidence threshold, overridden by config sensitivity. */
  threshold?: number;
  inputName?: string;
  outputName?: string;
};

/**
 * Real openWakeWord-style detector. Feed it a sliding PCM window and it runs a
 * single ONNX session per frame. No network, no logging of audio.
 */
export function createOnnxDetector(opts: OnnxDetectorOptions): WakeWordDetector {
  const windowSamples = opts.windowSamples ?? 20480;
  const threshold = opts.threshold ?? 0.5;
  const inputName = opts.inputName ?? 'input';
  const outputName = opts.outputName ?? 'output';

  let session: {
    run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array | number[] }>>;
  } | null = null;
  let loading: Promise<void> | null = null;
  let ring = new Float32Array(windowSamples);
  let filled = 0;
  let inFlight = false;
  // Detections resolved by the async model loop, drained on a later frame.
  const queue: { at: number; confidence: number }[] = [];

  const ensure = () => {
    if (session || loading) return loading;
    loading = opts.runtime.InferenceSession.create(opts.modelBytes).then((s) => {
      session = s;
    });
    return loading;
  };

  const score = async (at: number) => {
    if (!session) return;
    inFlight = true;
    try {
      const tensor = new opts.runtime.Tensor('float32', ring.slice(), [1, windowSamples]);
      const out = await session.run({ [inputName]: tensor });
      const raw = out[outputName]?.data;
      if (!raw) return;
      const confidence = typeof raw[0] === 'number' ? (raw[0] as number) : 0;
      if (confidence >= threshold) queue.push({ at, confidence });
    } catch {
      /* Model errors must never crash the chat surface. */
    } finally {
      inFlight = false;
    }
  };

  return {
    id: opts.id,
    detecting: true,
    reset() {
      ring = new Float32Array(windowSamples);
      filled = 0;
      queue.length = 0;
    },
    push({ frame, at }) {
      // Drain a detection resolved by a previous frame first.
      const hit = queue.shift();
      if (hit) return { fired: true, confidence: hit.confidence };

      // Slide the window (frame sizes are small, copy is cheap).
      if (frame.length >= windowSamples) {
        ring.set(frame.subarray(frame.length - windowSamples));
        filled = windowSamples;
      } else {
        ring.copyWithin(0, frame.length);
        ring.set(frame, windowSamples - frame.length);
        filled = Math.min(windowSamples, filled + frame.length);
      }
      // Silence gate: never run the model on pure silence.
      if (frameRms(frame) < 0.0005) {
        return { fired: false, confidence: null };
      }
      if (filled < windowSamples) {
        void ensure();
        return { fired: false, confidence: null };
      }
      if (!inFlight) void score(at);
      return { fired: false, confidence: null };
    },
  };
}

export type StubDetectorOptions = {
  id?: string;
  /**
   * Test-only escape hatch: forces a single fire on the Nth frame. Never wire
   * this to a real UI affordance.
   */
  fireOnFrame?: number;
  confidence?: number;
};

/**
 * A detector that NEVER detects for real. It is the default engine body while
 * the required ONNX model artifact is not bundled. It reports
 * `detecting: false` so callers must show "wake unavailable".
 */
export function createStubDetector(opts: StubDetectorOptions = {}): WakeWordDetector {
  let frames = 0;
  return {
    id: opts.id ?? 'stub',
    detecting: false,
    reset() {
      frames = 0;
    },
    push() {
      frames += 1;
      if (opts.fireOnFrame && frames === opts.fireOnFrame) {
        return { fired: true, confidence: opts.confidence ?? 1 };
      }
      return { fired: false, confidence: null };
    },
  };
}
