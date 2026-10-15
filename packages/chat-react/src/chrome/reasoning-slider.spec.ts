import { describe, expect, it } from 'vitest';
import { coerceReasoningEffort, reasoningEffortLabel, reasoningSliderStops } from './reasoning-slider.js';

describe('reasoning slider', () => {
  it('defaults to xhigh when no model is selected', () => {
    expect(reasoningSliderStops(null)).toEqual(['low', 'high', 'xhigh']);
    expect(coerceReasoningEffort(null, null)).toBe('xhigh');
  });

  it('keeps a chosen stop and snaps an unsupported one to the highest', () => {
    const levels = ['none', 'low', 'medium', 'high', 'xhigh'] as const;
    expect(reasoningSliderStops(levels)).toEqual(['low', 'high', 'xhigh']);
    expect(coerceReasoningEffort('low', levels)).toBe('low');
    expect(coerceReasoningEffort('medium', levels)).toBe('xhigh');
  });

  it('uses the highest stop the model actually supports', () => {
    expect(reasoningSliderStops(['none', 'low', 'medium', 'high'])).toEqual(['low', 'high']);
    expect(coerceReasoningEffort('xhigh', ['none', 'low', 'medium', 'high'])).toBe('high');
    expect(reasoningEffortLabel('xhigh')).toBe('xHigh');
  });
});
