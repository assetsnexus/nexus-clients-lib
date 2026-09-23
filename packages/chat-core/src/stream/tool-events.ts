import type { ChatToolRun, ChatToolRunStatus, SubAgentFinalStatus } from '../state.js';

export type ToolStreamEvent = { type: string; data?: unknown };

type ToolCallPayload = {
  callId?: string;
  id?: string;
  round?: number;
  name?: string;
  tool?: string;
  arguments?: string | Record<string, unknown>;
  approvalRequired?: boolean;
  approvalId?: string;
  parentCallId?: string;
};

type ToolResultPayload = ToolCallPayload & {
  result?: unknown;
  error?: unknown;
  status?: string;
};

const STATUS_SET = new Set<string>([
  'running',
  'success',
  'error',
  'needs_approval',
  'approved',
  'reverted',
  'paused',
  // P8-8: refused by the region tool bridge under the current chat mode —
  // must not fall through to the `d.result != null` -> 'success' default below.
  'mode_blocked',
]);

export function normalizeToolRunStatus(
  raw: unknown,
  opts?: { hasError?: boolean; hasResult?: boolean },
): ChatToolRunStatus {
  if (opts?.hasError) return 'error';
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'needs_approval' || s === 'approval_required' || s === 'pending_approval') {
    return 'needs_approval';
  }
  if (STATUS_SET.has(s)) return s as ChatToolRunStatus;
  if (opts?.hasResult) return 'success';
  return 'running';
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { raw };
    } catch {
      return { raw };
    }
  }
  return {};
}

function approvalFromResult(result: unknown, data: ToolResultPayload): boolean {
  if (data.approvalRequired) return true;
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return !!(r.approvalRequired || r.requiresApproval || r.needsApproval);
}

function approvalIdFrom(data: ToolResultPayload): string | null {
  if (typeof data.approvalId === 'string' && data.approvalId) return data.approvalId;
  const result = data.result;
  if (result && typeof result === 'object') {
    const id = (result as { approvalId?: unknown }).approvalId;
    if (typeof id === 'string' && id) return id;
    const grantId = (result as { grantId?: unknown }).grantId;
    if (typeof grantId === 'string' && grantId) return grantId;
    const details = (result as { details?: { grantId?: unknown } }).details;
    if (details && typeof details.grantId === 'string' && details.grantId) return details.grantId;
  }
  return null;
}

function statusFromToolResult(d: ToolResultPayload, existing?: ChatToolRun): ChatToolRunStatus {
  if (d.error) return 'error';
  if (approvalFromResult(d.result, d) || d.status === 'needs_approval') {
    return 'needs_approval';
  }
  if (d.status) {
    return normalizeToolRunStatus(d.status, {
      hasError: false,
      hasResult: d.result != null,
    });
  }
  if (d.result != null) return 'success';
  return existing?.status === 'running' ? 'success' : (existing?.status ?? 'success');
}

function formatError(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const SUB_AGENT_FINAL_SET = new Set<string>([
  'completed',
  'error',
  'timeout',
  'cancelled',
  'interrupted',
  'paused',
]);

function resolveSubAgentFinalStatus(
  raw: unknown,
  evType: string,
): SubAgentFinalStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (SUB_AGENT_FINAL_SET.has(s)) return s as SubAgentFinalStatus;
  return evType.endsWith('error') ? 'error' : 'completed';
}

function pickRunMeta(d: Record<string, unknown>): Partial<ChatToolRun> {
  const result =
    d.result && typeof d.result === 'object' ? (d.result as Record<string, unknown>) : null;
  const runId =
    (typeof d.runId === 'string' && d.runId) ||
    (typeof d.subAgentRunId === 'string' && d.subAgentRunId) ||
    (typeof result?.runId === 'string' && result.runId) ||
    (typeof result?.subAgentRunId === 'string' && result.subAgentRunId) ||
    null;
  const linkedConversationId =
    (typeof d.linkedConversationId === 'string' && d.linkedConversationId) ||
    (typeof result?.linkedConversationId === 'string' && result.linkedConversationId) ||
    null;
  const plan =
    (d.plan && typeof d.plan === 'object' ? d.plan : null) ||
    (result?.plan && typeof result.plan === 'object' ? result.plan : null);
  const tasks = Array.isArray(d.tasks)
    ? d.tasks
    : Array.isArray(result?.tasks)
      ? result.tasks
      : undefined;
  const costLimitMinor =
    typeof d.costLimitMinor === 'number'
      ? d.costLimitMinor
      : typeof result?.costLimitMinor === 'number'
        ? result.costLimitMinor
        : undefined;
  return {
    ...(runId ? { subAgentRunId: String(runId) } : {}),
    ...(linkedConversationId ? { linkedConversationId: String(linkedConversationId) } : {}),
    ...(plan ? { plan: plan as ChatToolRun['plan'] } : {}),
    ...(tasks ? { tasks: tasks as ChatToolRun['tasks'] } : {}),
    ...(costLimitMinor != null ? { costLimitMinor } : {}),
    ...(typeof d.startedAtMs === 'number'
      ? { startedAtMs: d.startedAtMs }
      : typeof d.startedAt === 'string' && !Number.isNaN(Date.parse(d.startedAt))
        ? { startedAtMs: Date.parse(d.startedAt) }
        : {}),
  };
}

/** Merge raw stream tool events into callId-keyed runs. */
export function mergeToolStreamEvents(
  events: ToolStreamEvent[],
  seed: ChatToolRun[] = [],
): ChatToolRun[] {
  const byId = new Map<string, ChatToolRun>();
  for (const run of seed) byId.set(run.id, { ...run });

  for (const ev of events) {
    if (!ev?.type) continue;

    if (ev.type === 'tool_call' || ev.type === 'sub_agent_tool_call') {
      const d = (ev.data || {}) as ToolCallPayload & Record<string, unknown>;
      const name = String(d.name || d.tool || 'tool');
      const callId = String(d.callId || d.id || '').trim() || `call-${byId.size}-${name}`;
      const meta = pickRunMeta(d as Record<string, unknown>);
      byId.set(callId, {
        id: callId,
        tool: name,
        label: name,
        status: 'running',
        args: parseArgs(d.arguments),
        round: d.round,
        approvalRequired: !!d.approvalRequired,
        approvalId: d.approvalId || null,
        parentCallId: d.parentCallId || null,
        kind: ev.type.startsWith('sub_agent') || name === 'run_sub_agent' ? 'sub_agent' : 'tool',
        startedAtMs: Date.now(),
        ...meta,
      });
      continue;
    }

    if (ev.type === 'tool_result' || ev.type === 'sub_agent_tool_result') {
      const d = (ev.data || {}) as ToolResultPayload & Record<string, unknown>;
      const callId = String(d.callId || d.id || '').trim() || `call-${byId.size}-tool`;
      const existing = byId.get(callId);
      const incomingName =
        (typeof d.name === 'string' && d.name.trim()) ||
        (typeof d.tool === 'string' && d.tool.trim()) ||
        '';
      // Preserve the original tool name when a status-only patch (e.g. paused) omits name.
      const name = incomingName || existing?.tool || 'tool';
      const status = statusFromToolResult(d, existing);
      const approvalRequired = status === 'needs_approval' || approvalFromResult(d.result, d);
      const meta = pickRunMeta(d as Record<string, unknown>);
      const patch: ChatToolRun = {
        id: callId,
        tool: name,
        label: existing?.label && !incomingName ? existing.label : name,
        status,
        args: existing?.args || {},
        result: d.result !== undefined ? d.result : existing?.result,
        error: formatError(d.error) ?? existing?.error ?? null,
        round: d.round ?? existing?.round,
        approvalRequired,
        approvalId: approvalIdFrom(d) || existing?.approvalId || null,
        parentCallId: d.parentCallId || existing?.parentCallId || null,
        kind:
          ev.type.startsWith('sub_agent') || name === 'run_sub_agent' || existing?.kind === 'sub_agent'
            ? 'sub_agent'
            : 'tool',
        ...meta,
      };
      byId.set(callId, existing ? { ...existing, ...patch, args: existing.args } : patch);
      continue;
    }

    if (ev.type === 'sub_agent_progress' || ev.type === 'sub_agent_token') {
      const d = (ev.data || {}) as ToolCallPayload & {
        text?: string;
        tokensUsed?: number;
        currentTool?: string;
      } & Record<string, unknown>;
      const callId = String(d.callId || d.id || d.parentCallId || '').trim();
      if (!callId) continue;
      const existing = byId.get(callId);
      const meta = pickRunMeta(d);
      if (existing) {
        existing.status = 'running';
        existing.kind = 'sub_agent';
        Object.assign(existing, meta);
        if (ev.type === 'sub_agent_token' && d.text) {
          existing.subAgentText = (existing.subAgentText || '') + d.text;
        }
        if (typeof d.tokensUsed === 'number') {
          existing.subAgentTokensUsed = d.tokensUsed;
        }
        if (typeof d.currentTool === 'string') {
          existing.subAgentCurrentTool = d.currentTool;
        }
      } else {
        byId.set(callId, {
          id: callId,
          tool: String(d.name || 'sub_agent'),
          label: String(d.name || 'sub_agent'),
          status: 'running',
          args: {},
          kind: 'sub_agent',
          parentCallId: d.parentCallId || null,
          subAgentText: ev.type === 'sub_agent_token' && d.text ? d.text : undefined,
          subAgentTokensUsed: typeof d.tokensUsed === 'number' ? d.tokensUsed : undefined,
          subAgentCurrentTool: typeof d.currentTool === 'string' ? d.currentTool : undefined,
          ...meta,
        });
      }
      continue;
    }

    if (ev.type === 'sub_agent_done' || ev.type === 'sub_agent_error') {
      const d = (ev.data || {}) as ToolResultPayload & {
        summary?: unknown;
        finalStatus?: string;
      } & Record<string, unknown>;
      const callId = String(d.callId || d.id || '').trim();
      if (!callId) continue;
      const existing = byId.get(callId);
      const status: ChatToolRunStatus = ev.type.endsWith('error') ? 'error' : 'success';
      const finalStatus = resolveSubAgentFinalStatus(d.finalStatus || d.status, ev.type);
      const meta = pickRunMeta(d);
      if (existing) {
        existing.status = status;
        existing.error = formatError(d.error) || existing.error;
        existing.kind = 'sub_agent';
        existing.subAgentSummary = d.summary ?? d.result;
        existing.subAgentFinalStatus = finalStatus;
        Object.assign(existing, meta);
      } else {
        byId.set(callId, {
          id: callId,
          tool: String(d.name || 'sub_agent'),
          label: String(d.name || 'sub_agent'),
          status,
          args: {},
          error: formatError(d.error),
          kind: 'sub_agent',
          subAgentSummary: d.summary ?? d.result,
          subAgentFinalStatus: finalStatus,
          ...meta,
        });
      }
    }
  }

  return [...byId.values()].sort((a, b) => {
    const ra = a.round ?? 0;
    const rb = b.round ?? 0;
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
}

function isSubAgentHistoryRow(row: Record<string, unknown>): boolean {
  const name = String(row.name || row.tool || '');
  return (
    row.kind === 'sub_agent' ||
    name === 'run_sub_agent' ||
    row.subAgentRunId != null ||
    row.subAgentFinalStatus != null ||
    row.linkedConversationId != null
  );
}

/** Rehydrate tool runs from persisted conversation toolCalls rows. */
export function rehydrateToolRunsFromHistory(
  toolCalls: Array<Record<string, unknown>> | null | undefined,
): ChatToolRun[] {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return [];
  const events: ToolStreamEvent[] = [];
  for (const row of toolCalls) {
    const callId = String(row.callId || row.id || '');
    const name = String(row.name || row.tool || 'tool');
    const sub = isSubAgentHistoryRow(row);
    const callType = sub ? 'sub_agent_tool_call' : 'tool_call';
    const resultType = sub ? 'sub_agent_tool_result' : 'tool_result';
    const meta = {
      runId: row.runId || row.subAgentRunId,
      subAgentRunId: row.subAgentRunId || row.runId,
      linkedConversationId: row.linkedConversationId,
      plan: row.plan,
      tasks: row.tasks,
      costLimitMinor: row.costLimitMinor,
    };
    events.push({
      type: callType,
      data: {
        callId,
        name,
        arguments: row.arguments ?? row.args ?? {},
        round: row.round,
        ...meta,
      },
    });
    if (row.result != null || row.error != null || row.status || row.subAgentFinalStatus) {
      events.push({
        type: resultType,
        data: {
          callId,
          name,
          result: row.result,
          error: row.error,
          status: row.status,
          approvalId: row.approvalId,
          approvalRequired: row.approvalRequired,
          summary: row.subAgentSummary ?? row.summary,
          finalStatus: row.subAgentFinalStatus,
          ...meta,
        },
      });
    }
    if (sub && (row.subAgentText || row.subAgentFinalStatus || row.subAgentSummary)) {
      if (row.subAgentText) {
        events.push({
          type: 'sub_agent_token',
          data: { callId, text: String(row.subAgentText), ...meta },
        });
      }
      if (row.subAgentFinalStatus || row.subAgentSummary) {
        events.push({
          type: row.subAgentFinalStatus === 'error' ? 'sub_agent_error' : 'sub_agent_done',
          data: {
            callId,
            name,
            summary: row.subAgentSummary ?? row.summary,
            finalStatus: row.subAgentFinalStatus || 'completed',
            result: row.result,
            ...meta,
          },
        });
      }
    }
  }
  return mergeToolStreamEvents(events);
}

export function patchToolRunStatus(
  runs: ChatToolRun[],
  callId: string,
  patch: Partial<Pick<ChatToolRun, 'status' | 'error' | 'approvalRequired' | 'approvalId' | 'result'>>,
): ChatToolRun[] {
  return runs.map((run) => (run.id === callId ? { ...run, ...patch } : run));
}
