import type { ChatToolRun, ChatTurn, SubAgentFinalStatus } from '../state.js';
import type { AgentRunSummary } from './types.js';

/**
 * Server-side AgentRun state → the parent chat's `run_sub_agent` rows.
 *
 * The live stream only reaches a parent while a socket is subscribed; after a
 * reload (or while the parent was idle) the history rows know nothing about a
 * sub-agent that paused for approval or finished in the background. The host
 * lists runs for the parent conversation and folds them in here.
 */

export type SubAgentPhase = NonNullable<ChatToolRun['subAgentPhase']>;

/** Minimal run shape — `AgentRunSummary` or an activity-event projection. */
export type SubAgentRunState = Pick<AgentRunSummary, 'runId' | 'status'> &
  Partial<Pick<AgentRunSummary, 'parentCallId' | 'linkedConversationId' | 'pendingApproval'>>;

const LIVE_STATUSES = new Set(['queued', 'pending', 'running']);

const FINAL_STATUS: Record<string, SubAgentFinalStatus> = {
  completed: 'completed',
  failed: 'error',
  error: 'error',
  timeout: 'timeout',
  cost_limit: 'error',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  interrupted: 'interrupted',
};

export function subAgentPhaseForRunStatus(status: string | null | undefined): SubAgentPhase | null {
  const st = String(status || '').toLowerCase();
  if (st === 'awaiting_approval') return 'awaiting_approval';
  if (st === 'paused') return 'paused';
  if (LIVE_STATUSES.has(st)) return 'running';
  return null;
}

function isSubAgentRow(row: ChatToolRun): boolean {
  return row.tool === 'run_sub_agent' || row.kind === 'sub_agent';
}

function patchRow(row: ChatToolRun, run: SubAgentRunState): ChatToolRun | null {
  const phase = subAgentPhaseForRunStatus(run.status);
  const next: ChatToolRun = { ...row };
  if (!next.subAgentRunId) next.subAgentRunId = run.runId;
  if (!next.linkedConversationId && run.linkedConversationId) {
    next.linkedConversationId = run.linkedConversationId;
  }
  if (phase) {
    next.subAgentPhase = phase;
    next.subAgentPendingApproval =
      phase === 'awaiting_approval' ? run.pendingApproval ?? row.subAgentPendingApproval ?? null : null;
    if (next.status !== 'running' && next.status !== 'paused') next.status = 'running';
  } else {
    const final = FINAL_STATUS[String(run.status || '').toLowerCase()];
    next.subAgentPhase = null;
    next.subAgentPendingApproval = null;
    if (final && !next.subAgentFinalStatus) next.subAgentFinalStatus = final;
    if (final && (next.status === 'running' || next.status === 'paused')) {
      next.status = final === 'completed' ? 'success' : 'error';
    }
  }
  const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  const changed =
    !same(next.subAgentRunId, row.subAgentRunId) ||
    !same(next.linkedConversationId, row.linkedConversationId) ||
    !same(next.subAgentPhase, row.subAgentPhase) ||
    JSON.stringify(next.subAgentPendingApproval ?? null) !==
      JSON.stringify(row.subAgentPendingApproval ?? null) ||
    !same(next.subAgentFinalStatus, row.subAgentFinalStatus) ||
    next.status !== row.status;
  return changed ? next : null;
}

/** Returns the same array instance when nothing matched or changed. */
export function applySubAgentRunStatesToTurns(
  turns: ChatTurn[],
  runs: SubAgentRunState[],
): ChatTurn[] {
  const valid = runs.filter((r) => r && typeof r.runId === 'string' && r.runId);
  if (!valid.length || !turns.length) return turns;
  const byRunId = new Map(valid.map((r) => [r.runId, r]));
  const byCallId = new Map(
    valid.filter((r) => r.parentCallId).map((r) => [String(r.parentCallId), r]),
  );
  let anyChanged = false;
  const nextTurns = turns.map((turn) => {
    const rows = turn.toolEvents;
    if (!rows?.length) return turn;
    let turnChanged = false;
    const nextRows = rows.map((row) => {
      if (!isSubAgentRow(row)) return row;
      const run =
        (row.subAgentRunId ? byRunId.get(row.subAgentRunId) : undefined) || byCallId.get(row.id);
      if (!run) return row;
      const patched = patchRow(row, run);
      if (!patched) return row;
      turnChanged = true;
      return patched;
    });
    if (!turnChanged) return turn;
    anyChanged = true;
    return { ...turn, toolEvents: nextRows };
  });
  return anyChanged ? nextTurns : turns;
}
