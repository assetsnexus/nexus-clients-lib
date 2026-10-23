import { describe, expect, it, vi } from 'vitest';
import {
  WAKE_WORD_ALLOWED_ACTIONS,
  WAKE_WORD_TRUST,
  createCustomSampleDetector,
  createStubDetector,
  createWakeWordEngine,
  defaultWakeWordConfig,
  decodeWavToFloat32,
  fingerprintPcm,
  frameRms,
  templateScore,
  type WakeWordConfig,
} from './index.js';

describe('wake-word trust invariants', () => {
  it('documents that wake never authorizes anything', () => {
    expect(WAKE_WORD_TRUST.satisfiesAuthentication).toBe(false);
    expect(WAKE_WORD_TRUST.satisfiesTwoFactor).toBe(false);
    expect(WAKE_WORD_TRUST.satisfiesSca).toBe(false);
    expect(WAKE_WORD_TRUST.satisfiesBiometricApproval).toBe(false);
    expect(WAKE_WORD_TRUST.satisfiesDeviceTrust).toBe(false);
    expect(WAKE_WORD_TRUST.isSpeakerVerification).toBe(false);
    expect(WAKE_WORD_TRUST.mayTriggerCommand).toBe(false);
    expect(WAKE_WORD_TRUST.mayApproveCommand).toBe(false);
    expect(WAKE_WORD_TRUST.audioLeavesDeviceBeforeWake).toBe(false);
  });

  it('is not telemetry: no detection (true or false positive) is ever reported', () => {
    expect(WAKE_WORD_TRUST.reportsDetectionsToBackend).toBe(false);
    expect(WAKE_WORD_TRUST.isActivityTracker).toBe(false);
    expect(WAKE_WORD_TRUST.transmitsOnlyOnUserSubmit).toBe(true);
  });

  it('only allows open_voice_session as a wake-driven action', () => {
    expect([...WAKE_WORD_ALLOWED_ACTIONS]).toEqual(['open_voice_session']);
  });

  it('forces on-device-only regardless of caller input', () => {
    const config = defaultWakeWordConfig({ enabled: true, onDeviceOnly: false });
    expect(config.onDeviceOnly).toBe(true);
  });

  it('defaults to disabled so nothing ships listening by accident', () => {
    expect(defaultWakeWordConfig().enabled).toBe(false);
  });
});

describe('stub detector', () => {
  it('never reports itself as detecting', () => {
    const d = createStubDetector();
    expect(d.detecting).toBe(false);
    expect(d.push({ frame: new Float32Array(512), at: 0 }).fired).toBe(false);
  });
});

describe('builtin engine without model artifact', () => {
  it('is unavailable and never claims detection', async () => {
    const engine = createWakeWordEngine({}, 'builtin');
    expect(engine.available).toBe(false);
    await engine.load(defaultWakeWordConfig({ enabled: true }));
    const status = engine.getStatus();
    expect(status.status).toBe('unavailable');
    expect(status.detecting).toBe(false);
    expect(status.message).toContain('artifact');
    const onWake = vi.fn();
    await engine.start(onWake);
    expect(engine.getStatus().detecting).toBe(false);
    expect(onWake).not.toHaveBeenCalled();
  });
});

describe('custom-sample detector', () => {
  function tone(samples: number, freq: number, sampleRate = 16000): Float32Array {
    const out = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const env = Math.sin((Math.PI * i) / samples);
      out[i] = env * Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.4;
    }
    return out;
  }

  it('fingerprints are mean-centred and unit-variance', () => {
    const fp = fingerprintPcm(tone(16000, 220));
    const mean = fp.envelope.reduce((a, b) => a + b, 0) / fp.frames;
    expect(Math.abs(mean)).toBeLessThan(1e-5);
  });

  it('normalised correlation of a template with itself is ~1', () => {
    const fp = fingerprintPcm(tone(16000, 220));
    expect(templateScore(fp.envelope, fp.envelope)).toBeGreaterThan(0.99);
  });

  it('fires when the enrolled phrase envelope is reproduced', () => {
    // Build a template from a known amplitude envelope, then feed frames whose
    // RMS traces the same shape. This exercises the correlation path directly.
    const hop = 512;
    const abs = [
      0.001, 0.004, 0.02, 0.09, 0.25, 0.35, 0.25, 0.09, 0.02, 0.004, 0.001, 0.0005, 0.0002,
      0.0001, 0.00005,
    ];
    const logs = abs.map((a) => Math.log10(a + 1e-6));
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    const variance = logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length;
    const std = Math.sqrt(variance) || 1;
    const envelope = Float32Array.from(logs.map((l) => (l - mean) / std));
    const detector = createCustomSampleDetector({
      fingerprint: { envelope, frames: envelope.length, sampleRate: 16000, hopSamples: hop },
      threshold: 0.5,
      consecutive: 1,
      cooldownFrames: 0,
    });

    let fired = false;
    for (let i = 0; i < abs.length && !fired; i++) {
      const frame = tone(hop, 300).map((v) => Math.sign(v) * abs[i]!);
      fired = detector.push({ frame, at: i }).fired;
    }
    expect(fired).toBe(true);
  });

  it('does not fire on unrelated quiet noise', () => {
    const phrase = fingerprintPcm(tone(8000, 300), { hopSamples: 512 });
    const detector = createCustomSampleDetector({
      fingerprint: phrase,
      threshold: 0.9,
      consecutive: 2,
    });
    const noise = new Float32Array(1024).fill(0.0001);
    let fired = false;
    for (let i = 0; i < 200; i++) fired = detector.push({ frame: noise, at: i }).fired || fired;
    expect(fired).toBe(false);
  });
});

describe('wav decoding', () => {
  function wavFromPcm(pcm: Float32Array): ArrayBuffer {
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buf);
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i]!)) * 32767, true);
    }
    return buf;
  }

  it('decodes a mono 16-bit PCM wav', () => {
    const pcm = new Float32Array([0, 0.5, -0.5, 1]);
    const decoded = decodeWavToFloat32(wavFromPcm(pcm));
    expect(decoded.length).toBe(4);
    expect(decoded[1]).toBeCloseTo(0.5, 3);
    expect(decoded[2]).toBeCloseTo(-0.5, 3);
  });

  it('returns empty for a non-RIFF buffer', () => {
    expect(decodeWavToFloat32(new ArrayBuffer(64)).length).toBe(0);
  });
});

describe('custom_sample engine enrolment', () => {
  it('enrols from a private ref without exposing ref in status', async () => {
    const pcm = new Float32Array(16000);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((i / 16000) * Math.PI * 4) * 0.3;
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buf);
    const str = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      view.setInt16(44 + i * 2, pcm[i]! * 32767, true);
    }

    const fetcher = vi.fn(async () => buf);
    const engine = createWakeWordEngine({}, 'custom_sample');
    const config: WakeWordConfig = defaultWakeWordConfig({
      enabled: true,
      engine: 'custom_sample',
      templateRef: 'private://wake/sample-1',
    });
    await engine.load(config, fetcher);
    expect(fetcher).toHaveBeenCalledWith('private://wake/sample-1');
    expect(engine.available).toBe(true);
    expect(JSON.stringify(engine.getStatus())).not.toContain('private://');
  });
});

describe('frameRms', () => {
  it('is zero for silence and positive for signal', () => {
    expect(frameRms(new Float32Array(16))).toBe(0);
    expect(frameRms(new Float32Array(16).fill(0.5))).toBeCloseTo(0.5, 5);
  });
});
