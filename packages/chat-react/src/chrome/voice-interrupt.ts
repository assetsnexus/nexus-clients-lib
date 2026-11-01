/**
 * Voice interruption policy: what sending a message does to speech that is
 * still playing or queued.
 *
 * Kept pure and framework-free so the composer's send path and the tests share
 * one definition — the same shape as the desktop's persisted
 * `UiSettings.voiceModes.interruptOnSend`.
 */

export type VoiceInterruptPolicy = 'skip_current' | 'clear_queue' | 'off';

/** Coerce an unknown value (a hand-edited settings block) to a known policy. */
export function normalizeVoiceInterruptPolicy(value: unknown): VoiceInterruptPolicy {
  return value === 'clear_queue' || value === 'off' ? value : 'skip_current';
}

/** True when a send should stop the utterance that is playing right now. */
export function shouldStopOnSend(policy: VoiceInterruptPolicy): boolean {
  return policy !== 'off';
}

/** True when a send should also drop everything still queued behind the current utterance. */
export function shouldClearQueueOnSend(policy: VoiceInterruptPolicy): boolean {
  return policy === 'clear_queue';
}
