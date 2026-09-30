import {
  collectSubAgentRuns,
  isActiveSubAgentStripStatus,
  visibleSubAgentStripRuns,
  type ChatTurn,
  type SubAgentStripItem,
} from '@nexus/chat-core';

/** Higher = worse for the compact chip label. */
const STATUS_SEVERITY: Record<string, number> = {
  error: 100,
  failed: 100,
  timeout: 95,
  interrupted: 90,
  awaiting_approval: 80,
  paused: 70,
  running: 50,
  queued: 45,
  pending: 40,
  cancelled: 20,
  completed: 10,
  success: 10,
};

export function subAgentStatusSeverity(status: string | null | undefined): number {
  return STATUS_SEVERITY[String(status || '').toLowerCase()] ?? 30;
}

export function worstSubAgentStatus(runs: SubAgentStripItem[]): string {
  if (!runs.length) return 'idle';
  let worst = runs[0]!;
  let score = subAgentStatusSeverity(worst.status);
  for (let i = 1; i < runs.length; i += 1) {
    const run = runs[i]!;
    const s = subAgentStatusSeverity(run.status);
    if (s > score) {
      worst = run;
      score = s;
    }
  }
  return worst.status || 'running';
}

export type SubAgentChipSummary = {
  count: number;
  worstStatus: string;
  runs: SubAgentStripItem[];
  hasError: boolean;
};

/** One-chip aggregation: visible runs → count + worst status. */
export function summarizeSubAgentChip(
  turns: ChatTurn[] | null | undefined,
  dismissedIds?: Iterable<string> | null,
): SubAgentChipSummary | null {
  const all = collectSubAgentRuns(turns);
  const runs = visibleSubAgentStripRuns(all, dismissedIds);
  if (!runs.length) return null;
  const worstStatus = worstSubAgentStatus(runs);
  return {
    count: runs.length,
    worstStatus,
    runs,
    hasError:
      runs.some((r) => Boolean(r.error)) ||
      ['error', 'failed', 'timeout'].includes(String(worstStatus).toLowerCase()),
  };
}

export function subAgentChipLabel(summary: SubAgentChipSummary): string {
  const n = summary.count;
  const unit = n === 1 ? 'sub-agent' : 'sub-agents';
  return `${n} ${unit} · ${summary.worstStatus}`;
}

export { isActiveSubAgentStripStatus };
