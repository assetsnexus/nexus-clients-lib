/**
 * On-device microphone capture for wake-word engines.
 *
 * This module owns the ONLY microphone path for wake detection. It:
 *  - requests `getUserMedia` (the host must already have permission),
 *  - runs a ScriptProcessor-free loop through an `AnalyserNode`,
 *  - hands raw PCM frames to a detector that lives entirely in the browser,
 *  - never sends audio anywhere.
 *
 * When WebAudio / getUserMedia is unavailable the source reports a clear
 * `unavailable` reason instead of pretending to listen.
 */

export type WakeAudioFrame = Float32Array;

export type WakeAudioSourceStatus =
  | 'idle'
  | 'listening'
  | 'stopped'
  | 'unavailable'
  | 'error';

export type WakeAudioSourceOptions = {
  /** Frames per second delivered to the detector (default 30). */
  framesPerSecond?: number;
  /** Samples per frame (16 kHz mono target; the browser resamples). */
  frameSamples?: number;
};

export type WakeAudioFrameHandler = (frame: WakeAudioFrame) => void;

export type WakeAudioSource = {
  readonly status: WakeAudioSourceStatus;
  readonly message: string | null;
  start(handler: WakeAudioFrameHandler): Promise<void>;
  stop(): void;
};

type AudioGlobals = {
  navigator?: { mediaDevices?: { getUserMedia?: (c: Record<string, unknown>) => Promise<MediaStream> } };
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
};

function audioGlobals(): AudioGlobals {
  return globalThis as unknown as AudioGlobals;
}

export function createWakeAudioSource(
  opts: WakeAudioSourceOptions = {},
): WakeAudioSource {
  const framesPerSecond = opts.framesPerSecond ?? 30;
  const frameSamples = opts.frameSamples ?? 512;
  const intervalMs = Math.max(10, Math.round(1000 / framesPerSecond));

  let status: WakeAudioSourceStatus = 'idle';
  let message: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buffer: Float32Array | null = null;
  let handler: WakeAudioFrameHandler | null = null;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      analyser?.disconnect();
    } catch {
      /* ignore */
    }
    analyser = null;
    try {
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    stream = null;
    try {
      void context?.close?.();
    } catch {
      /* ignore */
    }
    context = null;
    buffer = null;
    if (status !== 'unavailable' && status !== 'error') status = 'stopped';
  };

  return {
    get status() {
      return status;
    },
    get message() {
      return message;
    },
    async start(nextHandler: WakeAudioFrameHandler) {
      const g = audioGlobals();
      const getUserMedia = g.navigator?.mediaDevices?.getUserMedia;
      const Ctor = g.AudioContext || g.webkitAudioContext;
      if (!getUserMedia) {
        status = 'unavailable';
        message = 'Microphone capture unavailable (no getUserMedia).';
        return;
      }
      if (!Ctor) {
        status = 'unavailable';
        message = 'Web Audio unavailable for on-device wake detection.';
        return;
      }
      try {
        stream = await getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        context = new Ctor();
        const source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser();
        analyser.fftSize = Math.max(256, frameSamples);
        source.connect(analyser);
        buffer = new Float32Array(analyser.fftSize);
        handler = nextHandler;
        status = 'listening';
        message = null;
        timer = setInterval(() => {
          if (!analyser || !buffer || !handler) return;
          analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>);
          handler(buffer as Float32Array);
        }, intervalMs);
      } catch (err) {
        status = 'error';
        message = err instanceof Error ? err.message : 'Wake audio capture failed.';
        stop();
      }
    },
    stop,
  };
}

/** Root-mean-square level of a frame, for a mic indicator / silence gate. */
export function frameRms(frame: Float32Array): number {
  if (!frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / frame.length);
}
