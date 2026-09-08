import type { ChatToolRun, ChatToolRunStatus } from '../state.js';

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

/** Merge raw stream tool events into callId-keyed runs. */
export function mergeToolStreamEvents(events: ToolStreamEvent[]): ChatToolRun[] {
  const byId = new Map<string, ChatToolRun>();

  for (const ev of events) {
    if (!ev?.type) continue;

    if (ev.type === 'tool_call' || ev.type === 'sub_agent_tool_call') {
      const d = (ev.data || {}) as ToolCallPayload;
      const name = String(d.name || d.tool || 'tool');
      const callId = String(d.callId || d.id || '').trim() || `call-${byId.size}-${name}`;
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
        kind: ev.type.startsWith('sub_agent') ? 'sub_agent' : 'tool',
      });
      continue;
    }

    if (ev.type === 'tool_result' || ev.type === 'sub_agent_tool_result') {
      const d = (ev.data || {}) as ToolResultPayload;
      const name = String(d.name || d.tool || 'tool');
      const callId = String(d.callId || d.id || '').trim() || `call-${byId.size}-${name}`;
      const existing = byId.get(callId);
      const status = statusFromToolResult(d, existing);
      const approvalRequired = status === 'needs_approval' || approvalFromResult(d.result, d);
      const patch: ChatToolRun = {
        id: callId,
        tool: name,
        label: name,
        status,
        args: existing?.args || {},
        result: d.result,
        error: formatError(d.error),
        round: d.round ?? existing?.round,
        approvalRequired,
        approvalId: approvalIdFrom(d) || existing?.approvalId || null,
        parentCallId: d.parentCallId || existing?.parentCallId || null,
        kind: ev.type.startsWith('sub_agent') ? 'sub_agent' : 'tool',
      };
      byId.set(callId, existing ? { ...existing, ...patch, args: existing.args } : patch);
      continue;
    }

    if (ev.type === 'sub_agent_progress' || ev.type === 'sub_agent_token') {
      const d = (ev.data || {}) as ToolCallPayload & { text?: string };
      const callId = String(d.callId || d.id || d.parentCallId || '').trim();
      if (!callId) continue;
      const existing = byId.get(callId);
      if (existing) {
        existing.status = 'running';
        existing.kind = 'sub_agent';
      } else {
        byId.set(callId, {
          id: callId,
          tool: String(d.name || 'sub_agent'),
          label: String(d.name || 'sub_agent'),
          status: 'running',
          args: {},
          kind: 'sub_agent',
          parentCallId: d.parentCallId || null,
        });
      }
      continue;
    }

    if (ev.type === 'sub_agent_done' || ev.type === 'sub_agent_error') {
      const d = (ev.data || {}) as ToolResultPayload;
      const callId = String(d.callId || d.id || '').trim();
      if (!callId) continue;
      const existing = byId.get(callId);
      const status: ChatToolRunStatus = ev.type.endsWith('error') ? 'error' : 'success';
      if (existing) {
        existing.status = status;
        existing.error = formatError(d.error) || existing.error;
        existing.kind = 'sub_agent';
      } else {
        byId.set(callId, {
          id: callId,
          tool: String(d.name || 'sub_agent'),
          label: String(d.name || 'sub_agent'),
          status,
          args: {},
          error: formatError(d.error),
          kind: 'sub_agent',
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

/** Rehydrate tool runs from persisted conversation toolCalls rows. */
export function rehydrateToolRunsFromHistory(
  toolCalls: Array<Record<string, unknown>> | null | undefined,
): ChatToolRun[] {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return [];
  const events: ToolStreamEvent[] = [];
  for (const row of toolCalls) {
    const callId = String(row.callId || row.id || '');
    const name = String(row.name || row.tool || 'tool');
    events.push({
      type: 'tool_call',
      data: {
        callId,
        name,
        arguments: row.arguments ?? row.args ?? {},
        round: row.round,
      },
    });
    if (row.result != null || row.error != null || row.status) {
      events.push({
        type: 'tool_result',
        data: {
          callId,
          name,
          result: row.result,
          error: row.error,
          status: row.status,
          approvalId: row.approvalId,
          approvalRequired: row.approvalRequired,
        },
      });
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
