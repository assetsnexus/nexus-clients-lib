import type { ChatToolRun } from '@nexus/chat-core';

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

export function toolStatusClass(status: string | undefined): string {
  if (status === 'error' || status === 'reverted') return 'is-error';
  if (status === 'success' || status === 'approved') return 'is-success';
  if (status === 'running' || status === 'paused' || status === 'pending') return 'is-running';
  if (status === 'needs_approval') return 'is-approval';
  return '';
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
  return {
    id,
    tool: String((ev as ChatToolRun).tool || (ev as any).name || ''),
    label: String((ev as ChatToolRun).label || (ev as ChatToolRun).tool || (ev as any).name || ''),
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
  return (events || []).map((ev) => ({
    ...ev,
    id: ev.id || ev.callId,
    callId: ev.callId || ev.id,
    label: ev.label || ev.tool || ev.name,
    approvalRequired: !!(ev.approvalRequired || ev.status === 'needs_approval'),
  }));
}
