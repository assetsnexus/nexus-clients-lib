import { describe, expect, it } from 'vitest';
import type { ChatUsageSnapshot } from './types.js';
import {
  cacheHitPercent,
  contextFillPercent,
  formatUsageTokensLabel,
  usageBarModel,
} from './usage-bar.js';

describe('contextFillPercent', () => {
  it('returns null when tokens or window are missing or zero', () => {
    expect(contextFillPercent(100, null)).toBeNull();
    expect(contextFillPercent(100, 0)).toBeNull();
    expect(contextFillPercent(null, 1000)).toBeNull();
    expect(contextFillPercent(undefined, undefined)).toBeNull();
  });

  it('rounds and clamps percent', () => {
    expect(contextFillPercent(500, 1000)).toBe(50);
    expect(contextFillPercent(1, 3)).toBe(33);
    expect(contextFillPercent(2000, 1000)).toBe(100);
    expect(contextFillPercent(-5, 1000)).toBe(0);
    expect(contextFillPercent(15982, 128000)).toBe(12);
  });
});

describe('cacheHitPercent', () => {
  it('returns null for a missing rate', () => {
    expect(cacheHitPercent(null)).toBeNull();
    expect(cacheHitPercent(undefined)).toBeNull();
    expect(cacheHitPercent(Number.NaN)).toBeNull();
  });

  it('floors so a near-complete hit is never shown as 100%', () => {
    expect(cacheHitPercent(0.999)).toBe(99);
    expect(cacheHitPercent(1)).toBe(100);
    expect(cacheHitPercent(0.5)).toBe(50);
    expect(cacheHitPercent(0)).toBe(0);
  });

  it('clamps out-of-range input', () => {
    expect(cacheHitPercent(1.5)).toBe(100);
    expect(cacheHitPercent(-0.2)).toBe(0);
  });
});

describe('formatUsageTokensLabel', () => {
  it('formats used / max and degrades gracefully', () => {
    expect(formatUsageTokensLabel(1200, 128000)).toBe('1200 / 128000 tok');
    expect(formatUsageTokensLabel(500, null)).toBe('500 tok');
    expect(formatUsageTokensLabel(undefined, undefined)).toBe('—');
    expect(formatUsageTokensLabel(null, 128000)).toBe('0 / 128000 tok');
  });
});

describe('usageBarModel', () => {
  it('prefers the top-level window and cache rate', () => {
    const model = usageBarModel({
      tokensUsed: 15982,
      maxContextTokens: 128000,
      cacheHitRate: 0.42,
    } as ChatUsageSnapshot);
    expect(model).toEqual({
      contextPct: 12,
      contextLabel: '15982 / 128000 tok',
      cachePct: 42,
      cacheLabel: '42%',
      hasAny: true,
    });
  });

  it('falls back to the context snapshot window and cache rate', () => {
    const model = usageBarModel({
      tokensUsed: 4000,
      contextSnapshot: { maxContextTokens: 10000, cacheHitRate: 0.75 },
    } as ChatUsageSnapshot);
    expect(model.contextPct).toBe(40);
    expect(model.cachePct).toBe(75);
  });

  it('reports no data without inventing zeros', () => {
    const model = usageBarModel(null);
    expect(model.hasAny).toBe(false);
    expect(model.contextPct).toBeNull();
    expect(model.cachePct).toBeNull();
    expect(model.contextLabel).toBe('—');
    expect(model.cacheLabel).toBe('—');
  });
});
