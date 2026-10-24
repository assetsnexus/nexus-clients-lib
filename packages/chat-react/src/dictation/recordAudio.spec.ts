import { describe, expect, it, vi } from 'vitest';
import { createMediaRecorderCapture, type MediaRecorderLike } from './recordAudio.js';

/** Minimal MediaRecorder stand-in driven by the test instead of the engine. */
const MIME = 'audio/webm;codecs=opus';

function fakeRecorder(state = 'recording'): MediaRecorderLike & {
  emit: (bytes: number) => void;
  emitStop: () => void;
  stopCalls: number;
} {
  const rec = {
    state,
    mimeType: MIME,
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    onerror: null as (() => void) | null,
    stopCalls: 0,
    start() {
      rec.state = 'recording';
    },
    stop() {
      rec.stopCalls += 1;
      rec.state = 'inactive';
      rec.onstop?.();
    },
    emit(bytes: number) {
      rec.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: rec.mimeType }) });
    },
    emitStop() {
      rec.onstop?.();
    },
  };
  return rec;
}

describe('createMediaRecorderCapture', () => {
  it('resolves the encoded audio once stop is called', async () => {
    const rec = fakeRecorder();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
    });
    rec.emit(1024);
    const blob = await capture.stop();
    expect(blob.size).toBe(1024);
    expect(rec.stopCalls).toBe(1);
  });

  it('is idempotent: a double stop resolves the same blob and stops once', async () => {
    const rec = fakeRecorder();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
    });
    rec.emit(2048);
    const [first, second] = await Promise.all([capture.stop(), capture.stop()]);
    expect(first.size).toBe(2048);
    expect(second.size).toBe(2048);
    expect(rec.stopCalls).toBe(1);
  });

  it('cancel followed by stop still returns the audio (no double stop)', async () => {
    const rec = fakeRecorder();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
    });
    rec.emit(512);
    capture.cancel();
    const blob = await capture.stop();
    expect(blob.size).toBe(512);
    expect(rec.stopCalls).toBe(1);
  });

  it('resolves an empty blob when the recorder never delivered a frame', async () => {
    const rec = fakeRecorder();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
    });
    const blob = await capture.stop();
    expect(blob.size).toBe(0);
    expect(rec.stopCalls).toBe(1);
  });

  it('resolves with what it has when the recorder is already inactive', async () => {
    const rec = fakeRecorder('inactive');
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
    });
    const blob = await capture.stop();
    expect(blob.size).toBe(0);
    expect(rec.stopCalls).toBe(0);
  });

  it('releases the device stream exactly once', async () => {
    const rec = fakeRecorder();
    const releaseStream = vi.fn();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream,
      mimeType: MIME,
    });
    await Promise.all([capture.stop(), capture.cancel(), capture.stop()]);
    expect(releaseStream).toHaveBeenCalledTimes(1);
  });

  it('rejects when the recorder reports an error', async () => {
    const rec = fakeRecorder();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
    });
    // The engine can fail before the caller ever awaits `stop()`.
    rec.onerror?.();
    await expect(capture.stop()).rejects.toThrow('Recording failed.');
  });

  it('reports the capture window from the injected clock', async () => {
    const rec = fakeRecorder();
    let now = 1000;
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
      now: () => now,
    });
    now = 1500;
    expect(capture.elapsedMs()).toBe(500);
    await capture.stop();
  });

  it('forwards encoded frames to the live-STT sink', async () => {
    const rec = fakeRecorder();
    const onChunk = vi.fn();
    const capture = createMediaRecorderCapture({
      recorder: rec,
      releaseStream: () => undefined,
      mimeType: MIME,
      onChunk,
    });
    rec.emit(64);
    await vi.waitFor(() => expect(onChunk).toHaveBeenCalledTimes(1));
    await capture.stop();
  });
});
