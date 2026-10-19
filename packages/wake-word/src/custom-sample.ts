/**
 * Custom-sample wake detection (plan Part W "pluggable custom-sample path").
 *
 * The user enrols a private phrase by recording one or more wav samples. We
 * derive a compact, non-invertible fingerprint (log-mel energy envelope) once,
 * keep it in memory, and spot the phrase by sliding-window normalised
 * correlation. This is intentionally a lightweight on-device approach: it is
 * not speaker verification and it never stores or transmits raw audio beyond
 * the device-local enrolment step.
 *
 * NOTE: the private wav is only ever read through the injected
 * `WakeArtifactFetcher`; this module never logs bytes or refs.
 */

import { frameRms, type WakeAudioFrame } from './audio-source.js';
import type { WakeWordDetector } from './detector.js';

export type WakeTemplateFingerprint = {
  /** Normalised log-energy envelope, length = `frames`. */
  envelope: Float32Array;
  frames: number;
  sampleRate: number;
  hopSamples: number;
};

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_HOP = 512;

/**
 * Compute a fingerprint from mono float PCM. Public so hosts can pre-compute
 * templates on-device at enrolment time and store only the fingerprint.
 */
export function fingerprintPcm(
  pcm: Float32Array,
  opts: { sampleRate?: number; hopSamples?: number } = {},
): WakeTemplateFingerprint {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const hopSamples = opts.hopSamples ?? DEFAULT_HOP;
  const frames = Math.max(1, Math.floor(pcm.length / hopSamples));
  const envelope = new Float32Array(frames);
  let lo = Infinity;
  let hi = -Infinity;
  for (let f = 0; f < frames; f++) {
    const start = f * hopSamples;
    let sum = 0;
    for (let i = start; i < start + hopSamples && i < pcm.length; i++) {
      const v = pcm[i]!;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / hopSamples);
    // Log compression keeps a wide dynamic range usable for correlation.
    const e = Math.log10(rms + 1e-6);
    envelope[f] = e;
    if (e < lo) lo = e;
    if (e > hi) hi = e;
  }
  // Mean-centre + unit-variance so correlation is level-independent.
  const mean = envelope.reduce((a, b) => a + b, 0) / frames;
  let varSum = 0;
  for (let f = 0; f < frames; f++) {
    envelope[f] = envelope[f]! - mean;
    varSum += envelope[f]! * envelope[f]!;
  }
  const std = Math.sqrt(varSum / frames) || 1;
  for (let f = 0; f < frames; f++) envelope[f] = envelope[f]! / std;
  void lo;
  void hi;
  return { envelope, frames, sampleRate, hopSamples };
}

/** Normalised cross-correlation of a short window against the template. */
export function templateScore(
  window: Float32Array,
  template: Float32Array,
): number {
  const n = Math.min(window.length, template.length);
  if (n < 8) return 0;
  let dot = 0;
  let wa = 0;
  let ta = 0;
  for (let i = 0; i < n; i++) {
    dot += window[i]! * template[i]!;
    wa += window[i]! * window[i]!;
    ta += template[i]! * template[i]!;
  }
  const denom = Math.sqrt(wa) * Math.sqrt(ta);
  return denom === 0 ? 0 : dot / denom;
}

export type CustomSampleDetectorOptions = {
  id?: string;
  fingerprint: WakeTemplateFingerprint;
  /** Correlation threshold, derived from config sensitivity. */
  threshold?: number;
  /** Consecutive frames above threshold required to fire (debounce). */
  consecutive?: number;
  /** Frames skipped after firing so the phrase is not re-triggered. */
  cooldownFrames?: number;
};

/**
 * Detects a user-enrolled phrase by sliding the template over an incoming
 * envelope. On-device only; never sends the sample anywhere.
 */
export function createCustomSampleDetector(
  opts: CustomSampleDetectorOptions,
): WakeWordDetector {
  const template = opts.fingerprint.envelope;
  const threshold = opts.threshold ?? 0.82;
  const needConsecutive = Math.max(1, opts.consecutive ?? 2);
  const cooldownFrames = Math.max(0, opts.cooldownFrames ?? 40);
  const hop = opts.fingerprint.hopSamples;

  // Rolling envelope of recent audio, sized to hold the template plus margin.
  const capacity = Math.max(template.length * 2, 128);
  const recent = new Float32Array(capacity);
  let write = 0;
  let count = 0;
  let hits = 0;
  let cooldown = 0;

  const pushEnvelope = (value: number) => {
    recent[write] = value;
    write = (write + 1) % capacity;
    count = Math.min(count + 1, capacity);
  };

  const readWindow = (): Float32Array => {
    const out = new Float32Array(template.length);
    for (let i = 0; i < template.length; i++) {
      const idx = (write - template.length + i + capacity) % capacity;
      out[i] = recent[idx]!;
    }
    return out;
  };

  return {
    id: opts.id ?? 'custom-sample',
    detecting: true,
    reset() {
      recent.fill(0);
      write = 0;
      count = 0;
      hits = 0;
      cooldown = 0;
    },
    push({ frame, at }) {
      void at;
      if (cooldown > 0) {
        cooldown -= 1;
        return { fired: false, confidence: null };
      }
      // Convert this frame's RMS into one or more envelope steps.
      const steps = Math.max(1, Math.round(frame.length / hop));
      const rms = frameRms(frame as WakeAudioFrame);
      const e = Math.log10(rms + 1e-6);
      for (let s = 0; s < steps; s++) pushEnvelope(e);

      if (count < template.length) return { fired: false, confidence: null };
      // Mean-centre the window before scoring (template is already centred).
      const win = readWindow();
      const mean = win.reduce((a, b) => a + b, 0) / win.length;
      let varSum = 0;
      for (let i = 0; i < win.length; i++) {
        win[i] = win[i]! - mean;
        varSum += win[i]! * win[i]!;
      }
      const std = Math.sqrt(varSum / win.length) || 1;
      for (let i = 0; i < win.length; i++) win[i] = win[i]! / std;

      const score = templateScore(win, template);
      if (score >= threshold) {
        hits += 1;
        if (hits >= needConsecutive) {
          hits = 0;
          cooldown = cooldownFrames;
          return { fired: true, confidence: Math.min(1, score) };
        }
      } else {
        hits = 0;
      }
      return { fired: false, confidence: null };
    },
  };
}
