import { describe, expect, it } from 'vitest';
import { contextUsagePercent, formatContextTokensLabel } from './context-percent.js';

describe('contextUsagePercent', () => {
  it('returns null when max is missing or zero', () => {
    expect(contextUsagePercent(100, null)).toBeNull();
    expect(contextUsagePercent(100, 0)).toBeNull();
    expect(contextUsagePercent(null, 1000)).toBeNull();
  });

  it('rounds and clamps percent', () => {
    expect(contextUsagePercent(500, 1000)).toBe(50);
    expect(contextUsagePercent(1, 3)).toBe(33);
    expect(contextUsagePercent(2000, 1000)).toBe(100);
    expect(contextUsagePercent(-5, 1000)).toBe(0);
  });

  it('formats token labels', () => {
    expect(formatContextTokensLabel(1200, 128000)).toBe('1200 / 128000 tok');
    expect(formatContextTokensLabel(undefined, undefined)).toBe('—');
  });
});
