import type { ChatToolRun } from '@nexus/chat-core';

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

export function toolStatusClass(status: string | undefined): string {
  if (status === 'error' || status === 'reverted') return 'is-error';
  if (status === 'success' || status === 'approved' || status === 'completed') return 'is-success';
  if (status === 'running' || status === 'pending' || status === 'queued') return 'is-running';
  if (status === 'paused' || status === 'waiting') return 'is-paused';
  if (status === 'needs_approval') return 'is-approval';
  if (
    status === 'mode_blocked' ||
    status === 'timeout' ||
    status === 'cancelled' ||
    status === 'interrupted'
  ) {
    return 'is-mode-blocked';
  }
  return '';
}

export function toolStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'running':
      return 'running';
    case 'success':
    case 'approved':
    case 'completed':
      return 'done';
    case 'paused':
      return 'paused';
    case 'pending':
    case 'queued':
      return 'queued';
    case 'needs_approval':
      return 'approve';
    case 'mode_blocked':
      return 'blocked';
    case 'error':
    case 'reverted':
      return 'error';
    case 'timeout':
      return 'timeout';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    default:
      return status || '';
  }
}

export function truncateLabel(text: string, max = 72): string {
  const t = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Compact elapsed clock for running subagent widgets (`m:ss` or `h:mm:ss`). */
export function formatElapsedMs(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(Number(elapsedMs) / 1000) || 0);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Mirrors inference `command-mutation-heuristic` READ_ACTION_VERBS (display-only). */
const READ_ACTION_VERBS = new Set([
  'read',
  'get',
  'list',
  'list-by-org',
  'get-by-user',
  'search',
  'query',
  'count',
  'find',
  'export',
  'check',
  'granted',
  'locked-types',
  'status',
  'overview',
  'summary',
  'estimate',
  'trail',
  'health',
  'info',
  'discover',
  'browse',
  'preview',
  'stats',
  'ping',
  'config',
  'test-connection',
]);

export type ToolAccessKind = 'read' | 'write' | null;

function stringMeta(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Classify an anx.* tool for chip coloring.
 * Prefer explicit `@CommandMetadata` permissionAction / mutationClass when present
 * on sanitized args/result; otherwise infer from the command verb (same heuristic
 * as the inference mutation gate).
 */
export function resolveToolAccessKind(run: ChatToolRun | Record<string, unknown>): ToolAccessKind {
  const args = asRecord((run as ChatToolRun).args) || asRecord((run as { arguments?: unknown }).arguments);
  const result = asRecord((run as ChatToolRun).result);
  const annotated =
    stringMeta(args, 'permissionAction', 'action') ||
    stringMeta(result, 'permissionAction', 'action') ||
    stringMeta(asRecord(result?.meta), 'permissionAction', 'action') ||
    stringMeta(asRecord(result?.command), 'permissionAction', 'action');
  if (annotated) {
    const a = annotated.toLowerCase();
    if (a === 'read' || /(^|:)read($|:)/.test(a)) return 'read';
    if (a === 'write' || /(^|:)write($|:)/.test(a) || a.includes('write')) return 'write';
  }
  const mutation =
    stringMeta(args, 'mutationClass') ||
    stringMeta(result, 'mutationClass') ||
    stringMeta(asRecord(result?.meta), 'mutationClass');
  if (mutation) {
    const m = mutation.toLowerCase();
    if (m === 'read') return 'read';
    return 'write';
  }

  const command = displayAnxCommandName(run);
  if (!command.startsWith('anx.')) return null;
  const verb = (command.split('.').pop() || '').toLowerCase();
  if (READ_ACTION_VERBS.has(verb)) return 'read';
  return 'write';
}

export function displayAnxCommandName(ev: Record<string, unknown> | ChatToolRun): string {
  const tool = String((ev as ChatToolRun).tool || (ev as { name?: string }).name || '');
  const rawArgs =
    (ev as ChatToolRun).args ||
    (ev as { arguments?: unknown }).arguments ||
    {};
  let args: Record<string, unknown> = {};
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    args = rawArgs as Record<string, unknown>;
  } else if (typeof rawArgs === 'string') {
    try {
      const parsed = JSON.parse(rawArgs || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
  }
  const fromArgs = typeof args.command === 'string' ? args.command.trim() : '';
  if (fromArgs.startsWith('anx.')) return fromArgs;
  // Stream tool_result may carry a denormalized `command` when args were redacted.
  const topCommand = (ev as { command?: unknown }).command;
  if (typeof topCommand === 'string' && topCommand.trim().startsWith('anx.')) {
    return topCommand.trim();
  }
  const result = (ev as ChatToolRun).result;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const fromResult =
      (typeof r.command === 'string' && r.command.trim()) ||
      (r.resume &&
      typeof r.resume === 'object' &&
      typeof (r.resume as { command?: unknown }).command === 'string'
        ? String((r.resume as { command: string }).command).trim()
        : '') ||
      '';
    if (fromResult.startsWith('anx.')) return fromResult;
  }
  if (tool.startsWith('anx.')) return tool;
  if ((tool === 'anx_command' || tool === 'anx.command') && fromArgs) return fromArgs;
  return tool;
}

export function normalizeToolRun(ev: Record<string, unknown> | ChatToolRun): ChatToolRun & {
  argsPreview?: string;
} {
  const rawArgs = (ev as ChatToolRun).args || (ev as any).arguments;
  let args: Record<string, unknown> = {};
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    args = rawArgs as Record<string, unknown>;
  } else if (typeof rawArgs === 'string') {
    try {
      const parsed = JSON.parse(rawArgs || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
  }
  let argsPreview = '';
  if (Object.keys(args).length) {
    try {
      argsPreview = JSON.stringify(args, null, 0).slice(0, 160);
    } catch {
      argsPreview = '';
    }
  }
  const id = String((ev as ChatToolRun).id || (ev as any).callId || '');
  const tool = String((ev as ChatToolRun).tool || (ev as any).name || '');
  const commandLabel = displayAnxCommandName({ ...(ev as object), args } as ChatToolRun);
  // Keep the wire tool name (`anx_command`, `search_anx_commands`, …). Display
  // helpers rewrite the chip title; overwriting `tool` broke specialized labels.
  // Spread first: specialized widgets (sub-agent run id, linked chat, live text,
  // plan/tasks, pending approval, media refs) read fields beyond the basics.
  return {
    ...(ev as ChatToolRun),
    id,
    tool: tool || commandLabel,
    label: String((ev as ChatToolRun).label || commandLabel || tool || ''),
    status: ((ev as ChatToolRun).status || 'running') as ChatToolRun['status'],
    args,
    result: (ev as ChatToolRun).result,
    error: (ev as ChatToolRun).error ?? null,
    round: (ev as ChatToolRun).round,
    approvalRequired: !!(
      (ev as ChatToolRun).approvalRequired ||
      (ev as ChatToolRun).status === 'needs_approval'
    ),
    approvalId: (ev as ChatToolRun).approvalId ?? null,
    parentCallId: (ev as ChatToolRun).parentCallId ?? null,
    kind: (ev as ChatToolRun).kind,
    argsPreview,
  };
}

export function toolTimelineProps(events: Array<Record<string, unknown>>) {
  return (events || []).map((ev) => {
    const commandLabel = displayAnxCommandName(ev);
    const tool = String(ev.tool || ev.name || '');
    return {
      ...ev,
      id: ev.id || ev.callId,
      callId: ev.callId || ev.id,
      tool: tool || commandLabel,
      label: ev.label || commandLabel || tool || ev.name,
      approvalRequired: !!(ev.approvalRequired || ev.status === 'needs_approval'),
    };
  });
}

type SubAgentStreamEvent = { type: string; data?: Record<string, unknown> };

/**
 * Widget status for a `run_sub_agent` row. Server phase (approval pause /
 * paused, from the stream or `workloads.list`) wins over the raw event tail,
 * which only knows running vs done.
 */
export function resolveSubAgentWidgetStatus(
  run: ChatToolRun,
  events: SubAgentStreamEvent[],
): string {
  if (run.subAgentPhase === 'awaiting_approval') return 'awaiting_approval';
  if (run.subAgentPhase === 'paused') return 'paused';
  const done = events.find((e) => e.type === 'sub_agent_done');
  if (done) {
    const st = String(done.data?.status ?? 'completed');
    if (st === 'completed' || st === 'timeout' || st === 'cancelled') return st;
    return 'error';
  }
  if (events.length || run.subAgentPhase === 'running') return 'running';
  if (run.status === 'running' || run.status === 'paused') return run.status;
  return run.subAgentFinalStatus || 'completed';
}
