/**
 * Media capture for room meetings (Phase 7c).
 *
 * The desktop (and any host with a DOM) publishes a webcam and/or a screen
 * share into the room. Capture is a browser capability (`navigator.mediaDevices`)
 * so the device surface is injected, exactly like `xr.ts`, keeping this module
 * pure and unit-testable without a browser. Nothing here touches the SFU — the
 * caller hands the returned `MediaStream` to the room transport.
 */

/** Minimal `MediaStream` subset we depend on. */
export type MediaTrackLike = {
  kind?: string;
  stop?: () => void;
};

export type MediaStreamLike = {
  getTracks?: () => MediaTrackLike[];
  getVideoTracks?: () => MediaTrackLike[];
  getAudioTracks?: () => MediaTrackLike[];
};

/** Minimal `navigator.mediaDevices` subset we depend on. */
export type MediaDevicesLike = {
  getUserMedia?: (constraints: Record<string, unknown>) => Promise<MediaStreamLike>;
  getDisplayMedia?: (constraints: Record<string, unknown>) => Promise<MediaStreamLike>;
};

export type CaptureErrorCode =
  | 'unsupported'
  | 'denied'
  | 'no_devices'
  | 'insecure'
  | 'unknown';

export type CaptureResult =
  | { ok: true; stream: MediaStreamLike }
  | { ok: false; errorCode: CaptureErrorCode; message: string };

export type CameraCaptureOptions = {
  /** Specific camera device id (from `enumerateDevices`); omitted = default. */
  deviceId?: string | null;
  /** Also request the microphone (a meeting wants audio + video together). */
  withAudio?: boolean;
  /** Requested capture resolution. */
  width?: number;
  height?: number;
  /** Injected for tests / non-browser hosts. */
  mediaDevices?: MediaDevicesLike | null;
};

export type ScreenCaptureOptions = {
  /** Also mix system audio into the share when the platform allows it. */
  withAudio?: boolean;
  /** Prefer a full-monitor/self-capture hint over a picker where supported. */
  preferCurrentTab?: boolean;
  mediaDevices?: MediaDevicesLike | null;
};

/** Human-readable message for a capture failure code. */
export function captureErrorMessage(code: CaptureErrorCode): string {
  switch (code) {
    case 'unsupported':
      return 'This build cannot capture media (no mediaDevices API).';
    case 'denied':
      return 'Permission to use the camera or screen was denied.';
    case 'no_devices':
      return 'No camera or screen source is available.';
    case 'insecure':
      return 'Media capture needs a secure context (HTTPS or localhost).';
    default:
      return 'Could not start media capture.';
  }
}

/**
 * Map a `getUserMedia`/`getDisplayMedia` rejection to a reportable code.
 * `NotAllowedError` and `SecurityError` are permission/secure-context failures;
 * `NotFoundError`/`OverconstrainedError` mean no usable source.
 */
export function classifyCaptureError(err: unknown): CaptureErrorCode {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'SecurityError':
      return 'insecure';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_devices';
    case 'TypeError':
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** Resolve the ambient `navigator.mediaDevices` when one is not injected. */
function resolveMediaDevices(injected: MediaDevicesLike | null | undefined): MediaDevicesLike | null {
  if (injected !== undefined) return injected;
  if (typeof navigator === 'undefined') return null;
  const md = (navigator as Navigator & { mediaDevices?: MediaDevicesLike }).mediaDevices;
  return md ?? null;
}

/** Stop every track on a stream (idempotent; safe on `null`). */
export function stopMediaStream(stream: MediaStreamLike | null | undefined): void {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks() ?? []) {
    try {
      track.stop?.();
    } catch {
      /* already stopped */
    }
  }
}

/** True when the stream has a live (non-ended) video track. */
export function hasLiveVideo(stream: MediaStreamLike | null | undefined): boolean {
  if (!stream || typeof stream.getVideoTracks !== 'function') return false;
  return (stream.getVideoTracks() ?? []).length > 0;
}

/** True when the stream has a live audio track. */
export function hasLiveAudio(stream: MediaStreamLike | null | undefined): boolean {
  if (!stream || typeof stream.getAudioTracks !== 'function') return false;
  return (stream.getAudioTracks() ?? []).length > 0;
}

/** Start webcam (+ optional mic) capture. Never throws — returns a result. */
export async function startCameraCapture(opts: CameraCaptureOptions = {}): Promise<CaptureResult> {
  const devices = resolveMediaDevices(opts.mediaDevices);
  if (!devices || typeof devices.getUserMedia !== 'function') {
    return { ok: false, errorCode: 'unsupported', message: captureErrorMessage('unsupported') };
  }
  const video: Record<string, unknown> = { width: opts.width ?? 1280, height: opts.height ?? 720 };
  if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
  const constraints: Record<string, unknown> = {
    video,
    audio: opts.withAudio ?? true,
  };
  try {
    const stream = await devices.getUserMedia(constraints);
    return { ok: true, stream };
  } catch (err) {
    const errorCode = classifyCaptureError(err);
    return {
      ok: false,
      errorCode,
      message: err instanceof Error ? err.message : captureErrorMessage(errorCode),
    };
  }
}

/** Start screen-share capture. Never throws — returns a result. */
export async function startScreenCapture(opts: ScreenCaptureOptions = {}): Promise<CaptureResult> {
  const devices = resolveMediaDevices(opts.mediaDevices);
  if (!devices || typeof devices.getDisplayMedia !== 'function') {
    return { ok: false, errorCode: 'unsupported', message: captureErrorMessage('unsupported') };
  }
  const video: Record<string, unknown> = {};
  if (opts.preferCurrentTab) {
    // Chromium hint; ignored by runtimes that do not understand it.
    video.displaySurface = 'browser';
  }
  const constraints: Record<string, unknown> = {
    video,
    audio: opts.withAudio ?? false,
  };
  try {
    const stream = await devices.getDisplayMedia(constraints);
    return { ok: true, stream };
  } catch (err) {
    const errorCode = classifyCaptureError(err);
    return {
      ok: false,
      errorCode,
      message: err instanceof Error ? err.message : captureErrorMessage(errorCode),
    };
  }
}
