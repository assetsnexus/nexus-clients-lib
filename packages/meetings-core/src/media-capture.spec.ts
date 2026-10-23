import { describe, expect, it, vi } from 'vitest';
import {
  captureErrorMessage,
  classifyCaptureError,
  hasLiveAudio,
  hasLiveVideo,
  startCameraCapture,
  startScreenCapture,
  stopMediaStream,
  type MediaDevicesLike,
  type MediaStreamLike,
} from './media-capture.js';

function fakeStream(kinds: string[]): MediaStreamLike {
  const tracks = kinds.map(() => ({ kind: 'x', stop: vi.fn() }));
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((_, i) => kinds[i] === 'video'),
    getAudioTracks: () => tracks.filter((_, i) => kinds[i] === 'audio'),
  } as MediaStreamLike;
}

describe('classifyCaptureError', () => {
  it('maps permission errors to denied', () => {
    expect(classifyCaptureError({ name: 'NotAllowedError' })).toBe('denied');
    expect(classifyCaptureError({ name: 'PermissionDeniedError' })).toBe('denied');
  });

  it('maps security errors to insecure and missing device to no_devices', () => {
    expect(classifyCaptureError({ name: 'SecurityError' })).toBe('insecure');
    expect(classifyCaptureError({ name: 'NotFoundError' })).toBe('no_devices');
    expect(classifyCaptureError({ name: 'OverconstrainedError' })).toBe('no_devices');
  });

  it('maps type/unsupported errors and unknown fallbacks', () => {
    expect(classifyCaptureError({ name: 'TypeError' })).toBe('unsupported');
    expect(classifyCaptureError({ name: 'NotSupportedError' })).toBe('unsupported');
    expect(classifyCaptureError(new Error('boom'))).toBe('unknown');
    expect(classifyCaptureError(null)).toBe('unknown');
  });
});

describe('captureErrorMessage', () => {
  it('returns a message for every code', () => {
    for (const code of ['unsupported', 'denied', 'no_devices', 'insecure', 'unknown'] as const) {
      expect(captureErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});

describe('startCameraCapture', () => {
  it('reports unsupported when mediaDevices is absent', async () => {
    const res = await startCameraCapture({ mediaDevices: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe('unsupported');
  });

  it('requests audio + video by default and returns the stream', async () => {
    const stream = fakeStream(['video', 'audio']);
    const getUserMedia = vi.fn(async () => stream);
    const devices: MediaDevicesLike = { getUserMedia };
    const res = await startCameraCapture({ mediaDevices: devices });
    expect(res.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const constraints = getUserMedia.mock.calls[0][0] as { video: unknown; audio: boolean };
    expect(constraints.audio).toBe(true);
    expect(constraints.video).toEqual({ width: 1280, height: 720 });
  });

  it('pins an explicit device id with an exact constraint', async () => {
    const getUserMedia = vi.fn(async () => fakeStream(['video']));
    await startCameraCapture({ mediaDevices: { getUserMedia }, deviceId: 'cam-2', withAudio: false });
    const constraints = getUserMedia.mock.calls[0][0] as { video: Record<string, unknown>; audio: boolean };
    expect(constraints.video.deviceId).toEqual({ exact: 'cam-2' });
    expect(constraints.audio).toBe(false);
  });

  it('converts a rejection into a classified result', async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    const res = await startCameraCapture({ mediaDevices: { getUserMedia } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errorCode).toBe('denied');
      expect(res.message).toBe('denied');
    }
  });
});

describe('startScreenCapture', () => {
  it('reports unsupported without getDisplayMedia', async () => {
    const res = await startScreenCapture({ mediaDevices: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe('unsupported');
  });

  it('defaults to no audio and returns the display stream', async () => {
    const stream = fakeStream(['video']);
    const getDisplayMedia = vi.fn(async () => stream);
    const res = await startScreenCapture({ mediaDevices: { getDisplayMedia } });
    expect(res.ok).toBe(true);
    const constraints = getDisplayMedia.mock.calls[0][0] as { audio: boolean };
    expect(constraints.audio).toBe(false);
  });

  it('passes a current-tab display surface hint and audio when asked', async () => {
    const getDisplayMedia = vi.fn(async () => fakeStream(['video', 'audio']));
    await startScreenCapture({ mediaDevices: { getDisplayMedia }, withAudio: true, preferCurrentTab: true });
    const constraints = getDisplayMedia.mock.calls[0][0] as { video: Record<string, unknown>; audio: boolean };
    expect(constraints.video.displaySurface).toBe('browser');
    expect(constraints.audio).toBe(true);
  });
});

describe('stream helpers', () => {
  it('detects live audio/video tracks', () => {
    expect(hasLiveVideo(fakeStream(['video']))).toBe(true);
    expect(hasLiveVideo(fakeStream(['audio']))).toBe(false);
    expect(hasLiveAudio(fakeStream(['video', 'audio']))).toBe(true);
    expect(hasLiveVideo(null)).toBe(false);
  });

  it('stops every track and tolerates null / throwing tracks', () => {
    const stream = fakeStream(['video', 'audio']);
    stopMediaStream(stream);
    for (const t of stream.getTracks!()) expect(t.stop).toHaveBeenCalled();
    expect(() => stopMediaStream(null)).not.toThrow();
  });
});
