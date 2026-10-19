import { describe, expect, it } from 'vitest';
import { buildRealtimeTurnDetection } from './realtime-vad.js';

describe('buildRealtimeTurnDetection (plan Part C14)', () => {
  it('enables barge-in by default to match PSTN interruptOnCallerSpeech', () => {
    const vad = buildRealtimeTurnDetection();
    expect(vad.interrupt_response).toBe(true);
    expect(vad.create_response).toBe(true);
    expect(vad.type).toBe('server_vad');
  });

  it('refuses to disable barge-in via overrides', () => {
    const vad = buildRealtimeTurnDetection({ interrupt_response: false });
    expect(vad.interrupt_response).toBe(true);
  });

  it('still allows tuning non-security fields', () => {
    const vad = buildRealtimeTurnDetection({ silence_duration_ms: 900, threshold: 0.6 });
    expect(vad.silence_duration_ms).toBe(900);
    expect(vad.threshold).toBe(0.6);
    expect(vad.interrupt_response).toBe(true);
  });
});
