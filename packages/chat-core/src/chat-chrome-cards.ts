/**
 * Plan Part C quick wins — pure derivation helpers for the chat chrome cards.
 *
 * C5 permission summary card, C8 explain-last-action chip, C9 "working on" strip.
 * Kept framework-free so the shapes are unit-testable and shared by React/Vue.
 */

export type PermissionSummaryInput = {
  /** Capability ids / names the agent can use. */
  capabilities?: Array<string | { id?: string; name?: string; description?: string; category?: string }>;
  /** Tool pack ids the agent is granted. */
  toolPacks?: Array<string | { id?: string; name?: string; description?: string }>;
  /** Outbound audiences (contacts / groups) the agent may reach. */
  outboundAudiences?: Array<string | { id?: string; name?: string; kind?: string }>;
  /** Channels the agent can send on (email, sms…). */
  outboundChannels?: string[];
  /** Free-text approval policy, e.g. 'per_command' | 'auto'. */
  toolApprovalMode?: string | null;
};

export type PermissionSummarySection = {
  key: 'capabilities' | 'toolPacks' | 'outboundAudiences' | 'outboundChannels';
  label: string;
  items: string[];
  /** True when the section reads nothing personal (safe to show a stranger). */
  masked: boolean;
};

export type PermissionSummary = {
  sections: PermissionSummarySection[];
  approvalMode: string;
  /** Human sentence for the header. */
  headline: string;
  totalItems: number;
};

const MASKED_AUDIENCE = 'Masked audience';

/** Mask a single outbound audience label so the card is safe to render publicly. */
export function maskAudience(entry: unknown, index = 0): string {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return MASKED_AUDIENCE;
    // Keep a coarse kind (email domain suffix / phone country) but never the identity.
    return `${MASKED_AUDIENCE} ${index + 1}`;
  }
  if (entry && typeof entry === 'object') {
    const kind = (entry as { kind?: unknown }).kind;
    return kind ? `${MASKED_AUDIENCE} (${String(kind)})` : `${MASKED_AUDIENCE} ${index + 1}`;
  }
  return `${MASKED_AUDIENCE} ${index + 1}`;
}

function labelOf(entry: unknown): string {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object') {
    const e = entry as { name?: unknown; id?: unknown };
    return String(e.name || e.id || '').trim();
  }
  return '';
}

/**
 * Build a read-only summary of what an agent can do. Outbound audiences are
 * always masked (plan C5: "channels (masked) for users").
 */
export function buildPermissionSummary(input: PermissionSummaryInput): PermissionSummary {
  const caps = (input.capabilities || []).map(labelOf).filter(Boolean);
  const packs = (input.toolPacks || []).map(labelOf).filter(Boolean);
  const audiences = (input.outboundAudiences || []).map((a, i) => maskAudience(a, i));
  const channels = (input.outboundChannels || []).map((c) => String(c)).filter(Boolean);
  const approvalMode = input.toolApprovalMode || 'per_command';

  const sections: PermissionSummarySection[] = [
    { key: 'capabilities', label: 'Capabilities', items: caps, masked: false },
    { key: 'toolPacks', label: 'Tool packs', items: packs, masked: false },
    { key: 'outboundChannels', label: 'Channels', items: channels, masked: false },
    { key: 'outboundAudiences', label: 'Can reach', items: audiences, masked: true },
  ].filter((s) => s.items.length) as PermissionSummarySection[];

  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  const headline = totalItems
    ? `This agent has ${caps.length} capabilit${caps.length === 1 ? 'y' : 'ies'}, ${packs.length} tool pack${packs.length === 1 ? '' : 's'}`
    : 'No capabilities attached yet';

  return { sections, approvalMode, headline, totalItems };
}

/** True when a summary has nothing to render. */
export function permissionSummaryIsEmpty(summary: PermissionSummary): boolean {
  return summary.totalItems === 0;
}

// ---------------------------------------------------------------------------
// C8 — explain last action
// ---------------------------------------------------------------------------

export type ExplainActionInput = {
  toolName?: string | null;
  /** Why the model chose this (from B4 activity data / reasoning summary). */
  reason?: string | null;
  /** Arguments the tool was called with (already redacted by the host). */
  args?: Record<string, unknown> | null;
  /** Result summary / status. */
  resultSummary?: string | null;
  status?: string | null;
  approvalRequired?: boolean;
};

export type ExplainAction = {
  title: string;
  /** Ordered reasons; first is the model's own explanation when present. */
  reasons: string[];
  /** Short argument digest, e.g. "query=…". */
  argSummary: string | null;
  /** A one-line "why" for the chip. */
  why: string;
  needsApproval: boolean;
};

function humanizeTool(name: string): string {
  // Drop the vendor prefix but keep one level of context, e.g.
  // `anx.crm.lead.create` -> `lead create`; `anx.tasks.create` -> `tasks create`.
  const segments = name.split('.').filter(Boolean);
  const meaningful = segments.filter((s) => s !== 'anx' && s !== 'inference' && s !== 'agents');
  const kept = meaningful.length ? meaningful : segments;
  return kept
    .slice(-2)
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/** Summarise tool args without leaking long values. */
export function summarizeArgs(args: Record<string, unknown> | null | undefined): string | null {
  if (!args || typeof args !== 'object') return null;
  const keys = Object.keys(args).slice(0, 4);
  if (!keys.length) return null;
  const parts = keys.map((k) => {
    const v = args[k];
    if (v == null) return `${k}=—`;
    if (typeof v === 'string') return `${k}=${v.length > 24 ? `${v.slice(0, 21)}…` : v}`;
    if (typeof v === 'number' || typeof v === 'boolean') return `${k}=${v}`;
    if (Array.isArray(v)) return `${k}[${v.length}]`;
    return `${k}={…}`;
  });
  return parts.join(', ');
}

/**
 * Derive the "why" for the last action from the data the backend provides.
 * Never invents a reason: when none is supplied it says so plainly.
 */
export function explainLastAction(input: ExplainActionInput): ExplainAction {
  const tool = input.toolName ? humanizeTool(input.toolName) : 'Action';
  const reasons: string[] = [];
  const reason = (input.reason || '').trim();
  if (reason) reasons.push(reason);
  if (input.approvalRequired) reasons.push('Required your approval before running.');
  if (input.status) reasons.push(`Outcome: ${input.status}.`);
  if (input.resultSummary && input.resultSummary.trim()) {
    reasons.push(input.resultSummary.trim());
  }
  if (!reasons.length) reasons.push('No explanation was recorded for this action.');

  return {
    title: tool,
    reasons,
    argSummary: summarizeArgs(input.args),
    why: reasons[0],
    needsApproval: input.approvalRequired === true,
  };
}

// ---------------------------------------------------------------------------
// C8 adapter — read the "why" the backend attached to a tool run
// ---------------------------------------------------------------------------

/** Minimal tool-run shape the explainer reads (avoids importing chat state). */
export type ExplainableToolRun = {
  tool?: string;
  label?: string;
  status?: string;
  args?: Record<string, unknown> | null;
  result?: unknown;
  error?: string | null;
  approvalRequired?: boolean;
  reason?: string | null;
  resultSummary?: string | null;
};

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Plan Part C8 — build `ExplainActionInput` from a tool run. Tolerant: the
 * reason may live on the run or nested in its result (`reason` / `rationale` /
 * `why`). Never invents a reason; absence yields the honest fallback.
 */
export function explainInputFromRun(run: ExplainableToolRun): ExplainActionInput {
  const result =
    run.result && typeof run.result === 'object' ? (run.result as Record<string, unknown>) : null;
  const reason =
    nonEmptyString(run.reason) ||
    nonEmptyString(result?.reason) ||
    nonEmptyString(result?.rationale) ||
    nonEmptyString(result?.why);
  const resultSummary =
    nonEmptyString(run.resultSummary) ||
    nonEmptyString(result?.summary) ||
    (run.error ? String(run.error) : null);
  return {
    toolName: run.tool || null,
    reason,
    args: run.args || null,
    resultSummary,
    status: run.status || null,
    approvalRequired: run.status === 'needs_approval' || run.approvalRequired === true,
  };
}

/** True only when the backend actually supplied a reason or outcome to explain. */
export function explainHasReason(run: ExplainableToolRun): boolean {
  const input = explainInputFromRun(run);
  return Boolean(input.reason || input.resultSummary || input.approvalRequired);
}

// ---------------------------------------------------------------------------
// C9 — "working on" strip
// ---------------------------------------------------------------------------

export type WorkingOnRunInput = {
  id: string;
  label?: string | null;
  status?: string | null;
  startedAt?: string | null;
  agentName?: string | null;
};

export type WorkingOnLedgerInput = {
  id: string;
  summary?: string | null;
  kind?: string | null;
  status?: string | null;
  dueAt?: string | null;
};

export type WorkingOnItem = {
  id: string;
  kind: 'run' | 'ledger';
  label: string;
  status: string;
  /** True when the item is waiting on the user rather than the agent. */
  needsUser: boolean;
};

export type WorkingOnSummary = {
  items: WorkingOnItem[];
  runCount: number;
  ledgerCount: number;
  /** True while the agent has at least one live run. */
  busy: boolean;
  headline: string;
};

const RUN_ACTIVE = new Set(['running', 'queued', 'in_progress', 'pending', 'started', 'active']);
const RUN_BLOCKED = new Set(['needs_approval', 'awaiting_approval', 'blocked', 'paused']);
const LEDGER_OPEN = new Set(['open', 'in_progress', 'pending', 'active']);

function isActiveRun(status: string | null | undefined): boolean {
  if (!status) return true; // unknown runs are still "working on"
  return RUN_ACTIVE.has(status);
}

function normalizeState(status: string | null | undefined): string {
  return String(status || '').toLowerCase()
}

/**
 * Combine active AgentRuns and open ledger items into one "working on" strip.
 * Terminal runs/ledger items (completed, failed, cancelled, closed) are dropped.
 */
export function buildWorkingOnSummary(input: {
  runs?: WorkingOnRunInput[];
  ledger?: WorkingOnLedgerInput[];
}): WorkingOnSummary {
  const items: WorkingOnItem[] = [];

  for (const run of input.runs || []) {
    const status = normalizeState(run.status);
    if (status && !isActiveRun(status) && !RUN_BLOCKED.has(status)) continue;
    const needsUser = RUN_BLOCKED.has(status);
    items.push({
      id: run.id,
      kind: 'run',
      label: run.label?.trim() || 'Sub-agent run',
      status: run.status || 'running',
      needsUser,
    });
  }

  for (const entry of input.ledger || []) {
    const status = normalizeState(entry.status);
    if (status && !LEDGER_OPEN.has(status)) continue;
    items.push({
      id: entry.id,
      kind: 'ledger',
      label: entry.summary?.trim() || entry.kind || 'Open item',
      status: entry.status || 'open',
      needsUser: status === 'pending',
    });
  }

  const runCount = items.filter((i) => i.kind === 'run').length;
  const ledgerCount = items.filter((i) => i.kind === 'ledger').length;
  const busy = runCount > 0;

  let headline = 'Idle';
  if (items.length) {
    const parts: string[] = [];
    if (runCount) parts.push(`${runCount} run${runCount === 1 ? '' : 's'}`);
    if (ledgerCount) parts.push(`${ledgerCount} open item${ledgerCount === 1 ? '' : 's'}`);
    headline = `Working on ${parts.join(' · ')}`;
  }

  return { items, runCount, ledgerCount, busy, headline };
}

// ---------------------------------------------------------------------------
// C9 adapter — collect "working on" runs from live chat turns
// ---------------------------------------------------------------------------

/** Minimal shape we read off a chat turn (avoids importing chat-core here). */
type TurnLikeForRuns = {
  toolEvents?: Array<{
    id?: string;
    tool?: string;
    label?: string;
    kind?: string;
    status?: string;
    subAgentRunId?: string | null;
    startedAtMs?: number | null;
  }>;
};

/**
 * Derive C9 run inputs from the thread's live tool/sub-agent rows. Tolerant:
 * works with an empty/absent thread and never throws on partial data.
 */
export function workingOnRunsFromTurns(
  turns: TurnLikeForRuns[] | null | undefined,
): WorkingOnRunInput[] {
  if (!Array.isArray(turns) || !turns.length) return [];
  const byId = new Map<string, WorkingOnRunInput>();
  for (const turn of turns) {
    for (const run of turn?.toolEvents || []) {
      if (!run || (run.kind !== 'sub_agent' && !run.subAgentRunId)) continue;
      const id = (run.subAgentRunId || run.id || '').trim();
      if (!id) continue;
      byId.set(id, {
        id,
        label: (run.label || run.tool || 'Sub-agent run').trim(),
        status: run.status || 'running',
        startedAt: typeof run.startedAtMs === 'number' ? new Date(run.startedAtMs).toISOString() : null,
      });
    }
  }
  return [...byId.values()];
}
