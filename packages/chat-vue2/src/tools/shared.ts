import type { ChatToolRun } from '@nexus/chat-core';

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

export function toolStatusClass(status: string | undefined): string {
  if (status === 'error' || status === 'reverted') return 'is-error';
  if (status === 'success' || status === 'approved') return 'is-success';
  if (status === 'running' || status === 'paused' || status === 'pending') return 'is-running';
  if (status === 'needs_approval') return 'is-approval';
  // P8-8: mode refusal is a distinct "blocked pending action" state — never "done".
  if (status === 'mode_blocked') return 'is-mode-blocked';
  return '';
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
