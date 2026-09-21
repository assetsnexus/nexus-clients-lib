import type { ChatToolRun, ChatTurn } from '../state.js';
import type { SubAgentStripItem } from './types.js';

const ACTIVE_STRIP_STATUSES = new Set([
  'running',
  'paused',
  'queued',
  'pending',
  'awaiting_approval',
]);

function isSubAgentRun(run: ChatToolRun): boolean {
  return (
    run.kind === 'sub_agent' ||
    run.tool === 'run_sub_agent' ||
    Boolean(run.subAgentRunId) ||
    run.subAgentFinalStatus != null
  );
}

function missionFrom(run: ChatToolRun): string {
  if (typeof run.args?.mission === 'string' && run.args.mission.trim()) {
    return run.args.mission.trim();
  }
  if (typeof run.label === 'string' && run.label && run.label !== 'run_sub_agent') {
    return run.label;
  }
  return 'Subagent';
}

function statusFrom(run: ChatToolRun): string {
  if (run.subAgentFinalStatus) return run.subAgentFinalStatus;
  if (run.status === 'running' || run.status === 'paused') return run.status;
  if (run.status === 'error') return 'error';
  if (run.status === 'success') return 'completed';
  return run.status || 'running';
}

function errorFrom(run: ChatToolRun): string | null {
  if (typeof run.error === 'string' && run.error.trim()) return run.error.trim();
  if (
    run.result &&
    typeof run.result === 'object' &&
    typeof (run.result as { error?: unknown }).error === 'string'
  ) {
    const msg = String((run.result as { error: string }).error).trim();
    return msg || null;
  }
  if (
    run.result &&
    typeof run.result === 'object' &&
    typeof (run.result as { message?: unknown }).message === 'string' &&
    (statusFrom(run) === 'error' || statusFrom(run) === 'failed')
  ) {
    const msg = String((run.result as { message: string }).message).trim();
    return msg || null;
  }
  return null;
}

export function isActiveSubAgentStripStatus(status: string | null | undefined): boolean {
  return ACTIVE_STRIP_STATUSES.has(String(status || '').toLowerCase());
}

/** Collect unique subagent tool runs across turns for the compact strip. */
export function collectSubAgentRuns(turns: ChatTurn[] | null | undefined): SubAgentStripItem[] {
  if (!Array.isArray(turns) || !turns.length) return [];
  const byId = new Map<string, SubAgentStripItem>();
  for (const turn of turns) {
    for (const run of turn.toolEvents || []) {
      if (!isSubAgentRun(run)) continue;
      const runId =
        (typeof run.subAgentRunId === 'string' && run.subAgentRunId.trim()) ||
        (typeof run.result === 'object' &&
        run.result &&
        typeof (run.result as { runId?: unknown }).runId === 'string'
          ? String((run.result as { runId: string }).runId)
          : null) ||
        (typeof run.result === 'object' &&
        run.result &&
        typeof (run.result as { subAgentRunId?: unknown }).subAgentRunId === 'string'
          ? String((run.result as { subAgentRunId: string }).subAgentRunId)
          : null);
      const linkedConversationId =
        (typeof run.linkedConversationId === 'string' && run.linkedConversationId.trim()) ||
        (typeof run.result === 'object' &&
        run.result &&
        typeof (run.result as { linkedConversationId?: unknown }).linkedConversationId ===
          'string'
          ? String((run.result as { linkedConversationId: string }).linkedConversationId)
          : null);
      const key = runId || run.id;
      byId.set(key, {
        id: key,
        runId,
        parentCallId: run.id,
        mission: missionFrom(run),
        status: statusFrom(run),
        finalStatus: run.subAgentFinalStatus || null,
        linkedConversationId,
        startedAtMs: typeof run.startedAtMs === 'number' ? run.startedAtMs : null,
        plan: run.plan || null,
        tasks: run.tasks || [],
        error: errorFrom(run),
      });
    }
  }
  return [...byId.values()];
}

/**
 * Strip visibility:
 * - If any run is active → show active only (hide prior completed).
 * - Else → show non-dismissed completed/error/cancelled.
 */
export function visibleSubAgentStripRuns(
  runs: SubAgentStripItem[] | null | undefined,
  dismissedIds?: Iterable<string> | null,
): SubAgentStripItem[] {
  const list = Array.isArray(runs) ? runs : [];
  if (!list.length) return [];
  const dismissed = new Set(
    [...(dismissedIds || [])].map((id) => String(id)).filter(Boolean),
  );
  const active = list.filter((r) => isActiveSubAgentStripStatus(r.status));
  if (active.length) return active;
  return list.filter((r) => !dismissed.has(String(r.id)) && !dismissed.has(String(r.runId || '')));
}

export function activeSubAgentCountFromTurns(turns: ChatTurn[] | null | undefined): number {
  return collectSubAgentRuns(turns).filter((r) => isActiveSubAgentStripStatus(r.status)).length;
}
