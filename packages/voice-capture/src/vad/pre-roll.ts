/**
 * Pre-roll ring buffer (pure).
 *
 * When a wake phrase fires, the user has usually already started speaking — the
 * name *is* the first thing they said. A capture that only starts on the trigger
 * would clip the beginning of the utterance. This buffer continuously keeps the
 * last N milliseconds of PCM so a capture can prepend the audio that arrived
 * just *before* the trigger.
 *
 * It stores copies of recent frames and is cheap: a frame older than the window
 * is dropped as new frames arrive, so memory is bounded by `ms`.
 */

export type PreRollBuffer = {
  /** Append one frame (a copy is stored). */
  push(frame: Float32Array): void;
  /**
   * Remove and return the buffered prefix as one contiguous buffer, oldest
   * first. Empties the buffer. `sampleRate` is returned for the caller.
   */
  drain(): Float32Array | null;
  /** Peek at the buffered prefix without emptying it. */
  peek(): Float32Array | null;
  /** Buffered audio length, ms (approximate; uses the current sample rate). */
  readonly durationMs: number;
  /** Drop all buffered audio. */
  clear(): void;
};

export type PreRollOptions = {
  /** How much preceding audio to keep, ms (default 800). */
  ms?: number;
  /** Frame sample rate (Hz) used for the duration math (default 16000). */
  sampleRate?: number;
};

export function createPreRollBuffer(options: PreRollOptions = {}): PreRollBuffer {
  let sampleRate = Math.max(8000, Math.round(options.sampleRate ?? 16_000));
  let capacity = Math.max(0, Math.round((sampleRate * (options.ms ?? 800)) / 1000));
  let frames: Float32Array[] = [];
  let samples = 0;

  function trim(): void {
    while (samples > capacity && frames.length > 0) {
      const head = frames[0]!;
      const overflow = samples - capacity;
      if (head.length <= overflow) {
        frames.shift();
        samples -= head.length;
      } else {
        frames[0] = head.subarray(overflow);
        samples -= overflow;
      }
    }
  }

  function concat(): Float32Array | null {
    if (frames.length === 0 || samples === 0) return null;
    if (frames.length === 1) return frames[0]!;
    const out = new Float32Array(samples);
    let offset = 0;
    for (const frame of frames) {
      out.set(frame, offset);
      offset += frame.length;
    }
    return out;
  }

  return {
    push(frame) {
      if (!frame.length || capacity === 0) return;
      frames.push(frame.slice());
      samples += frame.length;
      trim();
    },
    drain() {
      const out = concat();
      frames = [];
      samples = 0;
      return out;
    },
    peek() {
      return concat();
    },
    get durationMs() {
      return sampleRate > 0 ? (samples / sampleRate) * 1000 : 0;
    },
    clear() {
      frames = [];
      samples = 0;
    },
  };
}
