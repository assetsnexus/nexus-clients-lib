import type { ChatUsageSnapshot } from './types.js';

/**
 * Compact dual progress-bar model for chat chrome: how full the model's context
 * window is, and how much of the last dispatch the provider served from its
 * prompt cache.
 *
 * Pure and framework-free so every surface (chat-vue2, chat-vue3, chat-react,
 * the portal header pill and the context donut) renders the same numbers — the
 * old `Usage: N tok /M Cost: …` string was duplicated per adapter and drifted,
 * and repeated the cost that the billing popover already shows.
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

export type ContextUsageModel = {
  /** Tokens in the payload last dispatched to the provider. The numerator. */
  usedTokens: number;
  /** The selected model's real context window. The denominator, or null. */
  maxTokens: number | null;
  /** Window fill, 0–100, or null when tokens/window are unknown. */
  pct: number | null;
  /** `used / max tok`, `used tok`, or `—`. */
  label: string;
};

/**
 * The one context-usage reading every chat surface derives.
 *
 * Numerator is the **post-trim size of the last dispatch** (`dispatchedTokens`),
 * falling back to stored size then `tokensUsed`. It is deliberately *not*
 * `tokensUsed`: that is the cumulative billed total for the whole conversation
 * (`conversation-usage-rollup`), so using it as the context numerator is what
 * made the SDK progress bar read 12% while the portal header pill read 93% for
 * the same thread.
 *
 * Denominator is the selected model's real window (`maxContextTokens`).
 * `dispatchBudgetTokens` (a fraction of the window) is a legacy-only fallback
 * for snapshots written before the window field existed.
 *
 * Precedence matches `contextDonutModel` (chat-react) and
 * `ContextDonutOverlay.vue` (portal) so the donut, the pill and the bar never
 * disagree.
 */
export function contextUsageModel(input: {
  snapshot?: ChatUsageSnapshot['contextSnapshot'] | null;
  tokensUsed?: number | null;
  maxContextTokens?: number | null;
}): ContextUsageModel {
  const snapshot = input.snapshot ?? null;
  const usedTokens =
    finite(snapshot?.dispatchedTokens) ??
    finite(snapshot?.totalTokens) ??
    finiteNonNegative(input.tokensUsed) ??
    0;
  const maxTokens =
    positive(snapshot?.maxContextTokens) ||
    positive(input.maxContextTokens) ||
    positive(snapshot?.dispatchBudgetTokens) ||
    null;
  const pct = maxTokens == null ? null : Math.min(100, Math.max(0, Math.round((usedTokens / maxTokens) * 100)));
  const label =
    maxTokens == null
      ? usedTokens > 0
        ? `${usedTokens} tok`
        : '—'
      : `${usedTokens} / ${maxTokens} tok`;
  return { usedTokens, maxTokens, pct, label };
}

/**
 * Context fill percent from `tokensUsed / maxContextTokens` (clamped 0–100).
 *
 * Kept as a thin primitive for callers that already resolved both numbers;
 * prefer {@link contextUsageModel} when a usage snapshot is available so the
 * dispatch-first numerator is applied.
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
  const context = contextUsageModel({
    snapshot: usage?.contextSnapshot ?? null,
    tokensUsed: usage?.tokensUsed ?? null,
    maxContextTokens: usage?.maxContextTokens ?? null,
  });
  const cacheRate = usage?.cacheHitRate ?? usage?.contextSnapshot?.cacheHitRate ?? null;
  const cachePct = cacheHitPercent(cacheRate);
  return {
    contextPct: context.pct,
    contextLabel: context.label,
    cachePct,
    cacheLabel: cachePct == null ? '—' : `${cachePct}%`,
    hasAny: context.pct != null || cachePct != null,
  };
}
