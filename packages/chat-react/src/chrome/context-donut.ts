/** Context-window slices. Same categories as the portal chat donut. */

const COLORS = ['#51cbce', '#6bd098', '#fbc658', '#ef8157', '#9368e9', '#aaaaaa', '#51bcda', '#f3a4b5'];

const CONTEXT_CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity & persona',
  instructions: 'Instructions & tool guidance',
  world_knowledge: 'World knowledge',
  page_context: 'Page / session context',
  page_tools: 'Page tools',
  workspace: 'Workspace',
  entity_index: 'Tracked entity index',
  tools: 'Tool schemas',
  chat_history: 'Chat history',
  tool_results: 'Tool call payloads',
  compaction_summary: 'Compaction summary',
};

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
      label: CONTEXT_CATEGORY_LABELS[item.category] || item.category,
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
  return { pct, tokenLabel, slices };
}
