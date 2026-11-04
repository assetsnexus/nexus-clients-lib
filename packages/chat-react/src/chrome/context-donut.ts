/** Context-window slices. Same categories as the portal chat donut. */

const COLORS = ['#51cbce', '#6bd098', '#fbc658', '#ef8157', '#9368e9', '#aaaaaa', '#51bcda', '#f3a4b5'];

/**
 * Mirrors inference `CONTEXT_CATEGORY_LABELS` (`context-category.constants.ts`).
 * Keep in sync with `ContextDonutOverlay.vue` (portal) and the inference
 * frontend donut — a parity spec asserts every backend `CONTEXT_CATEGORY_IDS`
 * member has a label here.
 */
const CONTEXT_CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity & persona',
  instructions: 'Instructions & tool guidance',
  app_guidance: 'App guidance',
  world_knowledge: 'World knowledge',
  plan: 'Active plan',
  page_context: 'Page / session context',
  page_tools: 'Page tools',
  workspace: 'Workspace',
  entity_index: 'Tracked entity index',
  objectives: 'Agent objectives',
  tools: 'Tool schemas',
  tool_concepts: 'Tool guidance concepts',
  lifecycle: 'Conversation lifecycle',
  chat_history: 'Chat history',
  tool_results: 'Tool call payloads',
  compaction_summary: 'Compaction summary',
};

/** Humanize an unknown category id so user UI never shows raw snake_case. */
function labelForCategory(category: string): string {
  const known = CONTEXT_CATEGORY_LABELS[category];
  if (known) return known;
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export type ContextDonutSlice = {
  category: string;
  label: string;
  pct: number;
  color: string;
  offset: number;
};

export type ContextDonutModel = {
  pct: number | null;
  tokenLabel: string;
  slices: ContextDonutSlice[];
  /** False when the snapshot has no real lane breakdown (see `contextDonutModel`). */
  measured: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function contextDonutModel(input: {
  snapshot?: unknown;
  tokensUsed?: number | null;
  maxContextTokens?: number | null;
}): ContextDonutModel {
  const snapshot = asRecord(input.snapshot);
  const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
  const slicesSource = categories
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => !!item)
    .map((item) => ({
      category: String(item.category || 'other'),
      tokens: finite(item.tokens) ?? 0,
      pct: finite(item.pct) ?? 0,
    }))
    .filter((item) => item.tokens > 0 || item.pct > 0);

  let offset = 25;
  const slices: ContextDonutSlice[] = slicesSource.map((item, index) => {
    const pct = Math.max(0, Math.min(100, Math.round(item.pct)));
    const slice: ContextDonutSlice = {
      category: item.category,
      label: labelForCategory(item.category),
      pct,
      color: COLORS[index % COLORS.length] || '#aaaaaa',
      offset,
    };
    offset -= pct;
    return slice;
  });

  const dispatched = finite(snapshot?.dispatchedTokens) ?? finite(snapshot?.totalTokens) ?? finite(input.tokensUsed) ?? 0;
  const max =
    finite(snapshot?.dispatchBudgetTokens) ||
    finite(snapshot?.maxContextTokens) ||
    (typeof input.maxContextTokens === 'number' && input.maxContextTokens > 0 ? input.maxContextTokens : null);
  const pct = max && max > 0 ? Math.min(100, Math.max(0, Math.round((dispatched / max) * 100))) : null;
  const tokenLabel = max ? `${dispatched} / ${max} tok` : dispatched > 0 ? `${dispatched} tok` : '—';
  // `measured` is false when the snapshot carries no real lane breakdown — either
  // an explicit `measured: false` flag (room/asset token-only snapshots) or a
  // snapshot with no `categories[]` array. Distinguishes "not measured" from
  // "measured and genuinely zero" so the UI never renders a misleading empty ring.
  const measured = snapshot?.measured !== false && Array.isArray(snapshot?.categories);
  return { pct, tokenLabel, slices, measured };
}
