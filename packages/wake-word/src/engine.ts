/**
 * WakeWordEngine implementations (plan Part W).
 *
 * `createWakeWordEngine()` is the single entry point used by chat surfaces.
 * It returns an engine that:
 *  - loads a detector (ONNX builtin, custom-sample, or external),
 *  - owns the on-device microphone path,
 *  - fires `onWake` at most once per activation,
 *  - NEVER authorizes anything.
 *
 * The builtin engine is a hard requirement of the spec. Because the openWakeWord
 * ONNX artifact is not vendored in this workspace, the builtin engine resolves
 * to a *stub detector* unless the host injects `{ runtime, modelBytes }`. A stub
 * detector reports `detecting: false` and `status: 'unavailable'`, so surfaces
 * must show "wake unavailable" and never present a listening affordance.
 */

import {
  createWakeAudioSource,
  type WakeAudioSource,
  type WakeAudioSourceOptions,
} from './audio-source.js';
import {
  createCustomSampleDetector,
  fingerprintPcm,
  type WakeTemplateFingerprint,
} from './custom-sample.js';
import { createOnnxDetector, createStubDetector, type OnnxRuntimeLike, type WakeWordDetector } from './detector.js';
import {
  defaultWakeWordConfig,
  type WakeArtifactFetcher,
  type WakeWordConfig,
  type WakeWordDetection,
  type WakeWordEngine,
  type WakeWordEngineKind,
  type WakeWordEngineStatus,
  type WakeWordOnWake,
  type WakeWordStatus,
} from './types.js';

/** Decode a mono 16-bit PCM wav to Float32 (device-local enrolment only). */
export function decodeWavToFloat32(bytes: ArrayBuffer): Float32Array {
  const view = new DataView(bytes);
  if (view.byteLength < 44) return new Float32Array(0);
  // "RIFF"...."WAVE"
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') return new Float32Array(0);
  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  let channels = 1;
  let bitsPerSample = 16;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = view.getUint16(body + 2, true) || 1;
      bitsPerSample = view.getUint16(body + 14, true) || 16;
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (dataOffset < 0 || bitsPerSample !== 16) return new Float32Array(0);
  const available = Math.min(dataLength, view.byteLength - dataOffset);
  const frames = Math.floor(available / 2 / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const idx = dataOffset + i * channels * 2;
    out[i] = view.getInt16(idx, true) / 32768;
  }
  return out;
}

export type WakeWordEngineDeps = {
  /**
   * Builtin ONNX runtime + model bytes. Without both, the builtin engine
   * degrades to the stub detector (unavailable, never detecting).
   */
  builtin?: { runtime: OnnxRuntimeLike; modelBytes: Uint8Array };
  /** Custom-sample enrolment fingerprint (already computed on-device). */
  customSample?: { fingerprint: WakeTemplateFingerprint };
  /** Bring-your-own engine for a host-provided detector factory. */
  external?: { kind: WakeWordEngineKind; create: (config: WakeWordConfig) => WakeWordDetector };
  audio?: WakeAudioSourceOptions;
};

function sensitivityToThreshold(sensitivity: number | undefined, base: number): number {
  const s = typeof sensitivity === 'number' ? Math.min(1, Math.max(0, sensitivity)) : 0.5;
  // Higher sensitivity => lower threshold (easier to fire).
  return Math.min(0.99, Math.max(0.05, base - (s - 0.5) * 0.4));
}

export class DefaultWakeWordEngine implements WakeWordEngine {
  readonly kind: WakeWordEngineKind;
  private readonly deps: WakeWordEngineDeps;
  private readonly audio: WakeAudioSource;
  private detector: WakeWordDetector | null = null;
  private config: WakeWordConfig = defaultWakeWordConfig();
  private status: WakeWordStatus = 'idle';
  private message: string | null = null;
  private onWake: WakeWordOnWake | null = null;
  private firedThisActivation = false;

  constructor(kind: WakeWordEngineKind, deps: WakeWordEngineDeps) {
    this.kind = kind;
    this.deps = deps;
    this.audio = createWakeAudioSource(deps.audio);
  }

  /** A stub/no-runtime engine can never genuinely detect. */
  get available(): boolean {
    if (this.detector) return this.detector.detecting;
    if (this.kind === 'builtin') return Boolean(this.deps.builtin);
    if (this.kind === 'custom_sample') return Boolean(this.deps.customSample);
    return Boolean(this.deps.external);
  }

  getStatus(): WakeWordEngineStatus {
    return {
      kind: this.kind,
      status: this.status,
      message: this.message,
      detecting: this.status === 'listening' && (this.detector?.detecting ?? false),
    };
  }

  async load(config: WakeWordConfig, fetchArtifact?: WakeArtifactFetcher): Promise<void> {
    this.config = defaultWakeWordConfig(config);
    this.status = 'loading';
    this.message = null;
    try {
      this.detector = await this.resolveDetector(this.config, fetchArtifact);
      this.status = 'idle';
      if (!this.available) {
        this.status = 'unavailable';
        this.message =
          this.kind === 'builtin'
            ? 'Wake-word model artifact not installed on this device.'
            : 'Wake-word engine not configured for this surface.';
      }
    } catch (err) {
      this.status = 'error';
      this.message = err instanceof Error ? err.message : 'Wake-word engine failed to load.';
      this.detector = null;
    }
  }

  private async resolveDetector(
    config: WakeWordConfig,
    fetchArtifact?: WakeArtifactFetcher,
  ): Promise<WakeWordDetector | null> {
    if (config.engine === 'external') {
      if (!this.deps.external) return null;
      return this.deps.external.create(config);
    }
    if (config.engine === 'custom_sample') {
      // Prefer a pre-computed fingerprint; otherwise enrol from the private ref.
      if (this.deps.customSample) {
        return createCustomSampleDetector({
          fingerprint: this.deps.customSample.fingerprint,
          threshold: sensitivityToThreshold(config.sensitivity, 0.82),
        });
      }
      const ref = config.templateRef ?? config.sampleRefs?.[0];
      if (ref && fetchArtifact) {
        const fingerprint = await this.enrolFromRef(ref, fetchArtifact);
        if (fingerprint) {
          return createCustomSampleDetector({
            fingerprint,
            threshold: sensitivityToThreshold(config.sensitivity, 0.82),
          });
        }
      }
      return createStubDetector({ id: 'custom-sample-unavailable' });
    }
    // builtin
    if (this.deps.builtin) {
      return createOnnxDetector({
        id: config.modelId ?? 'openwakeword',
        modelBytes: this.deps.builtin.modelBytes,
        runtime: this.deps.builtin.runtime,
        threshold: sensitivityToThreshold(config.sensitivity, 0.5),
      });
    }
    return createStubDetector({ id: config.modelId ?? 'openwakeword-stub' });
  }

  /**
   * Enrol a custom template from a private wav ref. The bytes stay in memory;
   * only the derived fingerprint is retained. The ref and bytes are never logged.
   */
  async enrolFromRef(
    ref: string,
    fetchArtifact: WakeArtifactFetcher,
  ): Promise<WakeTemplateFingerprint | null> {
    try {
      const bytes = await fetchArtifact(ref);
      const pcm = decodeWavToFloat32(bytes);
      if (!pcm.length) return null;
      return fingerprintPcm(pcm);
    } catch {
      return null;
    }
  }

  async start(onWake: WakeWordOnWake): Promise<void> {
    if (!this.config.enabled) {
      this.status = 'stopped';
      this.message = 'Wake word is disabled.';
      return;
    }
    if (!this.detector) {
      this.status = 'unavailable';
      this.message = 'Wake-word engine is not loaded.';
      return;
    }
    if (!this.detector.detecting) {
      // Stub: never pretend to listen.
      this.status = 'unavailable';
      this.message = 'Wake-word detection is unavailable on this device.';
      return;
    }
    this.onWake = onWake;
    this.firedThisActivation = false;
    this.detector.reset();
    await this.audio.start((frame) => this.handleFrame(frame));
    if (this.audio.status !== 'listening') {
      this.status = this.audio.status === 'unavailable' ? 'unavailable' : 'error';
      this.message = this.audio.message ?? 'Microphone is unavailable.';
    } else {
      this.status = 'listening';
      this.message = null;
    }
  }

  private handleFrame(frame: Float32Array): void {
    if (!this.detector || this.firedThisActivation) return;
    const result = this.detector.push({ frame, at: Date.now() });
    if (!result.fired) return;
    this.firedThisActivation = true;
    // Wake fires once; the session owner re-arms after the call ends.
    const detection: WakeWordDetection = {
      at: Date.now(),
      confidence: result.confidence,
      engineId: this.detector.id,
    };
    try {
      this.onWake?.(detection);
    } catch {
      /* A wake handler must never crash the surface. */
    }
  }

  stop(): void {
    this.audio.stop();
    this.detector?.reset();
    if (this.status !== 'unavailable' && this.status !== 'error') this.status = 'stopped';
  }

  dispose(): void {
    this.stop();
    this.detector = null;
    this.onWake = null;
    this.status = 'idle';
  }
}

/**
 * Create the wake-word engine for a surface. Defaults to the builtin engine so
 * callers get the spec'd shape even when no artifacts are present.
 */
export function createWakeWordEngine(
  deps: WakeWordEngineDeps = {},
  kind: WakeWordEngineKind = 'builtin',
): WakeWordEngine {
  return new DefaultWakeWordEngine(kind, deps);
}
