type SubEvent = { type: string; data?: Record<string, unknown> };

export const WEB_SEARCH_NESTED_TOOLS = new Set([
  'anx.ai-agents.web-search',
  'anx.ai-agents.web-search.fetch',
]);

export const MARKETPLACE_LIST_NESTED_TOOLS = new Set([
  'anx.marketplace.product.list',
  'anx.marketplace.products.query',
  'anx.marketplace.product.get',
  'anx.asset.marketplace-offer.search',
  'anx.asset.marketplace-offer.get',
  'anx.jobs.blueprint.list',
  'anx.jobs.request.list',
  'anx.jobs.offer.list',
]);

const ENGINE_ICON: Record<string, string> = {
  auto: '⚡',
  brave: 'B',
  google: 'G',
  bing: 'B',
  tavily: 'T',
  exa: 'E',
  duckduckgo: 'D',
  fetch: '↗',
  marketplace: '🛒',
};

export type NestedSearchToolRow = {
  callId: string;
  name: string;
  shortName: string;
  engineId: string | null;
  httpStatus: number | null;
  outcome: string | null;
  blockedReason: string | null;
  status: 'running' | 'done' | 'error';
  hint: string | null;
};

export function isSearchPresetNestedTool(name: string): boolean {
  const n = String(name || '').trim();
  return WEB_SEARCH_NESTED_TOOLS.has(n) || MARKETPLACE_LIST_NESTED_TOOLS.has(n);
}

export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function unwrapToolResult(raw: unknown): {
  body: Record<string, unknown> | null;
  responseCode: number | null;
  error: string | null;
} {
  const rec = asRecord(raw);
  if (!rec) return { body: null, responseCode: null, error: null };
  if (rec.status === 'error') {
    return {
      body: rec,
      responseCode: typeof rec.responseCode === 'number' ? rec.responseCode : null,
      error: String(rec.message || rec.code || 'error'),
    };
  }
  if (rec.status === 'ok') {
    const inner = asRecord(rec.result) ?? (rec.result != null ? { value: rec.result } : null);
    return {
      body: inner,
      responseCode: typeof rec.responseCode === 'number' ? rec.responseCode : 200,
      error: null,
    };
  }
  if (rec.error != null) {
    return { body: rec, responseCode: null, error: String(rec.error) };
  }
  return { body: rec, responseCode: null, error: null };
}

function shortToolName(name: string): string {
  if (name === 'anx.ai-agents.web-search') return 'web-search';
  if (name === 'anx.ai-agents.web-search.fetch') return 'fetch';
  const parts = name.split('.');
  return parts.slice(-2).join('.') || name;
}

function pickEngineId(args: Record<string, unknown>, body: Record<string, unknown> | null): string | null {
  const fromArgsProvider =
    typeof args.provider === 'string' && args.provider.trim() && args.provider !== 'auto'
      ? args.provider.trim()
      : null;
  if (fromArgsProvider) return fromArgsProvider;
  if (Array.isArray(args.engines) && args.engines.length) {
    const first = args.engines.find((e) => typeof e === 'string' && String(e).trim());
    if (typeof first === 'string') return first.trim();
  }
  if (typeof args.engineId === 'string' && args.engineId.trim()) return args.engineId.trim();
  if (body) {
    if (typeof body.provider === 'string' && body.provider.trim() && body.provider !== 'auto') {
      return body.provider.trim();
    }
    if (Array.isArray(body.providersUsed) && body.providersUsed.length) {
      const p = body.providersUsed.find((e) => typeof e === 'string' && String(e).trim());
      if (typeof p === 'string') return p.trim();
    }
    if (Array.isArray(body.results) && body.results.length) {
      const hit = body.results.find(
        (r) => r && typeof r === 'object' && typeof (r as { provider?: unknown }).provider === 'string',
      ) as { provider?: string } | undefined;
      if (hit?.provider) return hit.provider;
    }
  }
  return null;
}

function pickHttpStatus(
  name: string,
  body: Record<string, unknown> | null,
  responseCode: number | null,
): number | null {
  if (body && typeof body.httpStatus === 'number' && Number.isFinite(body.httpStatus)) {
    return body.httpStatus;
  }
  if (responseCode != null && Number.isFinite(responseCode)) return responseCode;
  if (name === 'anx.ai-agents.web-search.fetch' && body && !body.blockedReason) return 200;
  return null;
}

function pickOutcome(
  body: Record<string, unknown> | null,
  error: string | null,
  blockedReason: string | null,
  httpStatus: number | null,
): string | null {
  if (typeof body?.outcome === 'string' && body.outcome.trim()) return body.outcome.trim();
  if (blockedReason) return 'skipped';
  if (error) return 'skipped';
  if (httpStatus != null && httpStatus >= 400) return 'skipped';
  if (body || httpStatus != null) return 'result';
  return null;
}

function pickHint(name: string, args: Record<string, unknown>, body: Record<string, unknown> | null): string | null {
  if (name === 'anx.ai-agents.web-search.fetch') {
    const url =
      (typeof args.url === 'string' && args.url) ||
      (typeof body?.url === 'string' && body.url) ||
      (typeof body?.finalUrl === 'string' && body.finalUrl) ||
      null;
    return url ? url.replace(/^https?:\/\//, '').slice(0, 72) : null;
  }
  if (typeof args.query === 'string' && args.query.trim()) return args.query.trim().slice(0, 72);
  if (typeof args.id === 'string' && args.id.trim()) return args.id.trim().slice(0, 72);
  return null;
}

export function extractNestedSearchToolRow(
  name: string,
  argsRaw: unknown,
  resultRaw: unknown | undefined,
  hasResult: boolean,
): NestedSearchToolRow {
  const args = parseToolArguments(argsRaw);
  const { body, responseCode, error } = unwrapToolResult(resultRaw);
  const blockedReason =
    typeof body?.blockedReason === 'string' && body.blockedReason.trim()
      ? body.blockedReason.trim()
      : null;
  const httpStatus = pickHttpStatus(name, body, responseCode);
  const outcome = pickOutcome(body, error, blockedReason, httpStatus);
  const engineId =
    name === 'anx.ai-agents.web-search.fetch'
      ? 'fetch'
      : MARKETPLACE_LIST_NESTED_TOOLS.has(name)
        ? 'marketplace'
        : pickEngineId(args, body);
  let status: NestedSearchToolRow['status'] = 'running';
  if (hasResult) {
    status = error || blockedReason || (httpStatus != null && httpStatus >= 400) ? 'error' : 'done';
  }
  return {
    callId: '',
    name,
    shortName: shortToolName(name),
    engineId,
    httpStatus,
    outcome,
    blockedReason,
    status,
    hint: pickHint(name, args, body),
  };
}

export function pairSubAgentToolEvents(
  calls: SubEvent[],
  results: SubEvent[],
): Array<{ call: SubEvent; result?: SubEvent }> {
  const resultByCallId = new Map<string, SubEvent>();
  for (const ev of results) {
    const id = String(ev.data?.callId || '').trim();
    if (id) resultByCallId.set(id, ev);
  }
  return calls.map((call) => {
    const callId = String(call.data?.callId || '').trim();
    return { call, result: callId ? resultByCallId.get(callId) : undefined };
  });
}

export function engineIconLabel(engineId: string | null): string {
  if (!engineId) return '•';
  return ENGINE_ICON[engineId] || engineId.slice(0, 1).toUpperCase();
}

export function engineChipClass(engineId: string | null): string {
  if (!engineId) return '';
  if (engineId === 'fetch') return 'is-fetch';
  if (engineId === 'marketplace') return 'is-marketplace';
  return `is-engine-${engineId.replace(/[^a-z0-9_-]/gi, '')}`;
}

export function outcomeChipClass(outcome: string | null, blockedReason: string | null): string {
  if (blockedReason) return 'is-mode-blocked';
  if (!outcome) return '';
  if (outcome === 'result') return 'is-success';
  if (outcome === 'evaluation') return 'is-running';
  if (outcome === 'skipped') return 'is-mode-blocked';
  return '';
}

export function httpStatusChipClass(status: number | null): string {
  if (status == null) return '';
  if (status >= 200 && status < 300) return 'is-success';
  if (status >= 400) return 'is-error';
  return 'is-running';
}

export function summaryMarkdownText(summary: unknown): string {
  if (typeof summary === 'string') return summary.trim();
  if (summary && typeof summary === 'object') {
    const rec = summary as Record<string, unknown>;
    if (typeof rec.compactSummary === 'string') return rec.compactSummary.trim();
    if (typeof rec.summary === 'string') return rec.summary.trim();
  }
  return '';
}
