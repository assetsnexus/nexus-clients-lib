/**
 * Signal-level helpers shared by the microphone graph, the VAD segmenter and the
 * dictation controller. Pure math, no DOM.
 */

/** Root-mean-square level of a PCM frame (0..1-ish). */
export function frameRms(frame: Float32Array): number {
  if (!frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / frame.length);
}

/** Concatenate PCM chunks into one buffer (no copy when there is a single chunk). */
export function concatPcm(chunks: readonly Float32Array[]): Float32Array {
  if (chunks.length === 1) return chunks[0]!;
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
