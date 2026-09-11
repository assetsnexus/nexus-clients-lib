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

export function displayAnxCommandName(ev: Record<string, unknown> | ChatToolRun): string {
  const tool = String((ev as ChatToolRun).tool || (ev as { name?: string }).name || '');
  const args = ((ev as ChatToolRun).args || (ev as { arguments?: unknown }).arguments || {}) as Record<
    string,
    unknown
  >;
  const fromArgs = typeof args.command === 'string' ? args.command.trim() : '';
  if (fromArgs.startsWith('anx.')) return fromArgs;
  if (tool.startsWith('anx.')) return tool;
  if ((tool === 'anx_command' || tool === 'anx.command') && fromArgs) return fromArgs;
  return tool;
}

export function normalizeToolRun(ev: Record<string, unknown> | ChatToolRun): ChatToolRun & {
  argsPreview?: string;
} {
  const args = (ev as ChatToolRun).args || (ev as any).arguments;
  let argsPreview = '';
  if (args && typeof args === 'object' && Object.keys(args as object).length) {
    try {
      argsPreview = JSON.stringify(args, null, 0).slice(0, 160);
    } catch {
      argsPreview = '';
    }
  }
  const id = String((ev as ChatToolRun).id || (ev as any).callId || '');
  const tool = String((ev as ChatToolRun).tool || (ev as any).name || '');
  const commandLabel = displayAnxCommandName(ev);
  return {
    id,
    tool: commandLabel || tool,
    label: String((ev as ChatToolRun).label || commandLabel || tool || ''),
    status: ((ev as ChatToolRun).status || 'running') as ChatToolRun['status'],
    args: (args && typeof args === 'object' ? args : {}) as Record<string, unknown>,
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
    return {
      ...ev,
      id: ev.id || ev.callId,
      callId: ev.callId || ev.id,
      tool: commandLabel || ev.tool || ev.name,
      label: ev.label || commandLabel || ev.tool || ev.name,
      approvalRequired: !!(ev.approvalRequired || ev.status === 'needs_approval'),
    };
  });
}
