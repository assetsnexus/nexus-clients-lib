import { describe, expect, it } from 'vitest';
import {
  normalizeVoiceInterruptPolicy,
  shouldClearQueueOnSend,
  shouldStopOnSend,
} from './voice-interrupt.js';

describe('voice interruption policy', () => {
  it('defaults an unknown value to skip_current', () => {
    expect(normalizeVoiceInterruptPolicy(undefined)).toBe('skip_current');
    expect(normalizeVoiceInterruptPolicy('nonsense')).toBe('skip_current');
    expect(normalizeVoiceInterruptPolicy(null)).toBe('skip_current');
  });

  it('accepts the two explicit alternatives', () => {
    expect(normalizeVoiceInterruptPolicy('clear_queue')).toBe('clear_queue');
    expect(normalizeVoiceInterruptPolicy('off')).toBe('off');
  });

  it('stops the current utterance for anything except off', () => {
    expect(shouldStopOnSend('skip_current')).toBe(true);
    expect(shouldStopOnSend('clear_queue')).toBe(true);
    expect(shouldStopOnSend('off')).toBe(false);
  });

  it('clears the queue only for clear_queue', () => {
    expect(shouldClearQueueOnSend('clear_queue')).toBe(true);
    expect(shouldClearQueueOnSend('skip_current')).toBe(false);
    expect(shouldClearQueueOnSend('off')).toBe(false);
  });
});
