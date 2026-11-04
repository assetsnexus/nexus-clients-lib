import type { ChatUsageSnapshot } from './types.js';

/**
 * Compact dual progress-bar model for chat chrome: how full the model's context
 * window is, and how much of the last dispatch the provider served from its
 * prompt cache.
 *
 * Pure and framework-free so every surface (chat-vue2, chat-vue3, chat-react)
 * renders the same numbers — the old `Usage: N tok /M Cost: …` string was
 * duplicated per adapter and drifted, and repeated the cost that the billing
 * popover already shows.
 */
export type UsageBarModel = {
  /** Context window fill, 0–100, or null when tokens/window are unknown. */
  contextPct: number | null;
  /** `used / max tok`, or `used tok`, or `—`. */
  contextLabel: string;
  /** Prompt-cache hit rate, 0–100, or null when the provider reported none. */
  cachePct: number | null;
  /** `NN%` or `—`. */
  cacheLabel: string;
  /** True when there is something to render (context or cache). */
  hasAny: boolean;
};

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Any finite number (negatives are clamped by the caller). */
function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Context fill percent from `tokensUsed / maxContextTokens` (clamped 0–100).
 * Falls back to the snapshot's window when the top-level field is absent.
 */
export function contextFillPercent(
  tokensUsed: number | null | undefined,
  maxContextTokens: number | null | undefined,
): number | null {
  const used = finite(tokensUsed);
  const max = positive(maxContextTokens);
  if (used == null || max == null) return null;
  return Math.min(100, Math.max(0, Math.round((used / max) * 100)));
}

/**
 * Cache-hit percent from a 0–1 ratio. Floored (not rounded) so a 99.9% hit is
 * not shown as a flat "100%", which reads as "this turn was free" — mirrors the
 * inference frontend's `cacheHitPct`.
 */
export function cacheHitPercent(rate: number | null | undefined): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  const clamped = Math.min(1, Math.max(0, rate));
  return Math.floor(clamped * 100);
}

export function formatUsageTokensLabel(
  tokensUsed: number | null | undefined,
  maxContextTokens: number | null | undefined,
): string {
  const used = finiteNonNegative(tokensUsed);
  const max = positive(maxContextTokens);
  if (used == null && max == null) return '—';
  if (max == null) return used != null && used > 0 ? `${used} tok` : '—';
  return `${used ?? 0} / ${max} tok`;
}

export function usageBarModel(usage: ChatUsageSnapshot | null | undefined): UsageBarModel {
  const tokensUsed = usage?.tokensUsed ?? null;
  const max =
    usage?.maxContextTokens ?? usage?.contextSnapshot?.maxContextTokens ?? null;
  const contextPct = contextFillPercent(tokensUsed, max);
  const cacheRate = usage?.cacheHitRate ?? usage?.contextSnapshot?.cacheHitRate ?? null;
  const cachePct = cacheHitPercent(cacheRate);
  return {
    contextPct,
    contextLabel: formatUsageTokensLabel(tokensUsed, max),
    cachePct,
    cacheLabel: cachePct == null ? '—' : `${cachePct}%`,
    hasAny: contextPct != null || cachePct != null,
  };
}
