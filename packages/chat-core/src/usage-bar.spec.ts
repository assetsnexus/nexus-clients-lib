import { describe, expect, it } from 'vitest';
import type { ChatUsageSnapshot } from './types.js';
import {
  cacheHitPercent,
  contextFillPercent,
  contextUsageModel,
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

describe('contextUsageModel', () => {
  it('uses the last dispatch size, not the cumulative billed tokens', () => {
    // The bug: the portal header pill and the SDK bar read different numerators
    // because one used `tokensUsed` (cumulative billed total) and the other
    // `dispatchedTokens` (last payload). A long thread has a small dispatch and a
    // huge cumulative total, so the two readings diverged (12% vs 93%).
    const model = contextUsageModel({
      tokensUsed: 2_400_000,
      maxContextTokens: 1_048_576,
      snapshot: { dispatchedTokens: 130_000, totalTokens: 480_000, maxContextTokens: 1_048_576 },
    });
    expect(model.usedTokens).toBe(130_000);
    expect(model.pct).toBe(12);
    expect(model.label).toBe('130000 / 1048576 tok');
  });

  it('falls back to stored size then tokensUsed when no dispatch was recorded', () => {
    expect(
      contextUsageModel({
        tokensUsed: 999,
        maxContextTokens: 1000,
        snapshot: { totalTokens: 500 },
      }).usedTokens,
    ).toBe(500);
    expect(
      contextUsageModel({ tokensUsed: 999, maxContextTokens: 1000 }).usedTokens,
    ).toBe(999);
  });

  it('prefers the model window over the legacy dispatch trim budget', () => {
    const model = contextUsageModel({
      snapshot: { dispatchedTokens: 40, dispatchBudgetTokens: 80 },
      maxContextTokens: 100,
    });
    expect(model.maxTokens).toBe(100);
    expect(model.pct).toBe(40);
    // Legacy snapshot with no window field at all still renders from the budget.
    expect(
      contextUsageModel({ snapshot: { dispatchedTokens: 40, dispatchBudgetTokens: 80 } }).maxTokens,
    ).toBe(80);
  });

  it('reports no percent without a window but keeps the raw count', () => {
    const model = contextUsageModel({ tokensUsed: 500 });
    expect(model.pct).toBeNull();
    expect(model.label).toBe('500 tok');
    expect(contextUsageModel({}).label).toBe('—');
  });

  it('never overflows 100% when stored totalTokens exceeds the model window', () => {
    // Real live snapshot shape: `totalTokens` (live stored set) can exceed both
    // the window and the dispatch budget on a long session. Using it as the
    // numerator produced the impossible "179% of 128,000"; `dispatchedTokens`
    // (post-trim, bounded by the budget) is the only correct numerator.
    const model = contextUsageModel({
      snapshot: { totalTokens: 35_207, dispatchedTokens: 28_617, maxContextTokens: 32_000 },
    });
    expect(model.usedTokens).toBe(28_617);
    expect(model.pct).toBe(89);
    expect(model.pct).toBeLessThanOrEqual(100);
    expect(
      contextUsageModel({ snapshot: { totalTokens: 200_000, maxContextTokens: 128_000 } }).pct,
    ).toBe(100);
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
