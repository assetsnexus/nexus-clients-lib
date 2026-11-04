import { usageBarModel, type ChatUsageSnapshot } from '@nexus/chat-core';

/**
 * Compact dual progress bar for chat chrome: how full the model's context window
 * is, and how much of the last dispatch the provider served from its prompt
 * cache.
 *
 * Replaces the old `Usage: N tok /M Cost: …` text, which repeated the cost the
 * billing surfaces already own. Rendered with `<span>`s so it can live inside a
 * button (meter chip / column bar). Numbers come from chat-core's
 * `usageBarModel`, shared by chat-vue2/chat-vue3.
 */
export function UsageBars({
  usage,
  compact = false,
  title = 'Context usage and prompt-cache hit rate',
}: {
  usage?: ChatUsageSnapshot | null;
  /** Hide the token hint to fit a chip / narrow bar. */
  compact?: boolean;
  title?: string;
}) {
  const model = usageBarModel(usage);

  if (!model.hasAny) {
    // No window (or nothing measured) — still surface the raw token count when
    // we have one, rather than an empty gap.
    if (model.contextLabel === '—') return null;
    return (
      <span className="nexus-chat__usage-bars" data-nexus-usage-bars="" title={title}>
        <span className="nexus-chat__usage-bar nexus-chat__usage-bar--text">
          {model.contextLabel}
        </span>
      </span>
    );
  }

  return (
    <span className="nexus-chat__usage-bars" data-nexus-usage-bars="" title={title}>
      {model.contextPct != null ? (
        <span className="nexus-chat__usage-bar" data-nexus-usage-bar="context">
          <span className="nexus-chat__usage-bar-label">Context</span>
          <span
            className="nexus-chat__usage-bar-track"
            role="progressbar"
            aria-label="Context window used"
            aria-valuenow={model.contextPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="nexus-chat__usage-bar-fill"
              data-nexus-usage-fill="context"
              style={{ width: `${model.contextPct}%` }}
            />
          </span>
          <span className="nexus-chat__usage-bar-value">{model.contextPct}%</span>
          {!compact ? (
            <span className="nexus-chat__usage-bar-hint">{model.contextLabel}</span>
          ) : null}
        </span>
      ) : null}
      {model.cachePct != null ? (
        <span className="nexus-chat__usage-bar" data-nexus-usage-bar="cache">
          <span className="nexus-chat__usage-bar-label">Cache</span>
          <span
            className="nexus-chat__usage-bar-track"
            role="progressbar"
            aria-label="Prompt cache hit rate"
            aria-valuenow={model.cachePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="nexus-chat__usage-bar-fill nexus-chat__usage-bar-fill--cache"
              data-nexus-usage-fill="cache"
              style={{ width: `${model.cachePct}%` }}
            />
          </span>
          <span className="nexus-chat__usage-bar-value">{model.cacheLabel}</span>
        </span>
      ) : null}
    </span>
  );
}
