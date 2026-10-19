/**
 * Plan Part C14 — in-app realtime voice turn-taking defaults.
 *
 * The in-app realtime session must match the PSTN path's barge-in behaviour so a
 * caller can interrupt the agent the same way on a voice call and in the app.
 *
 * PSTN reference (inference, `twilio-voice-session.service.ts`):
 *   `runtime.interruptOnCallerSpeech` defaults to `true`.
 *
 * In-app reference (this module): `server_vad.interrupt_response` is `true` and
 * `create_response` is `true`, so caller speech both interrupts the current
 * response and starts the next turn.
 *
 * Do not flip `interrupt_response` to false: that would make the app listen-only
 * while the agent speaks and diverge from PSTN barge-in.
 */

export type RealtimeTurnDetection = {
  type: 'server_vad';
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  create_response: boolean;
  /**
   * Barge-in: caller speech interrupts the in-flight assistant response.
   * MUST stay `true` to match PSTN `interruptOnCallerSpeech`.
   */
  interrupt_response: boolean;
};

/**
 * Build the `session.update` audio input turn-detection block. Kept out of the
 * class so the barge-in invariant is unit-testable.
 */
export function buildRealtimeTurnDetection(
  overrides: Partial<RealtimeTurnDetection> = {},
): RealtimeTurnDetection {
  const { interrupt_response: _ignored, ...rest } = overrides;
  return {
    type: 'server_vad',
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 700,
    create_response: true,
    ...rest,
    // Plan Part C14 — barge-in parity with PSTN. Not overridable: a caller must
    // never be able to silently disable barge-in and diverge from the phone path.
    interrupt_response: true,
  };
}
