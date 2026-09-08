export const SCHEDULE_CHECK_BACK_TOOL_NAME = 'schedule_check_back';

export type ScheduleCheckBackResult = {
  scheduled: boolean;
  delaySec: number;
  reason: string;
  wakeAt: string;
  watchIds?: string[];
  iteration?: number;
  message?: string;
  wakeUp?: boolean;
  elapsedSinceStartSec?: number;
  jobStatuses?: unknown[];
};

export function parseScheduleCheckBackResult(result: unknown): ScheduleCheckBackResult | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as Record<string, unknown>;
  if (row.scheduled !== true) return null;
  if (typeof row.delaySec !== 'number' || !Number.isFinite(row.delaySec)) return null;
  if (typeof row.reason !== 'string' || !row.reason.trim()) return null;
  if (typeof row.wakeAt !== 'string' || !row.wakeAt.trim()) return null;
  return {
    scheduled: true,
    delaySec: row.delaySec,
    reason: row.reason.trim(),
    wakeAt: row.wakeAt,
    watchIds: Array.isArray(row.watchIds)
      ? row.watchIds.filter((id): id is string => typeof id === 'string')
      : undefined,
    iteration: typeof row.iteration === 'number' ? row.iteration : undefined,
    message: typeof row.message === 'string' ? row.message : undefined,
    wakeUp: row.wakeUp === true,
    elapsedSinceStartSec:
      typeof row.elapsedSinceStartSec === 'number' ? row.elapsedSinceStartSec : undefined,
    jobStatuses: Array.isArray(row.jobStatuses) ? row.jobStatuses : undefined,
  };
}

export function isScheduleCheckBackTool(toolName: string): boolean {
  return toolName === SCHEDULE_CHECK_BACK_TOOL_NAME;
}

export function checkBackWakeAtMs(result: ScheduleCheckBackResult): number {
  const parsed = Date.parse(result.wakeAt);
  return Number.isFinite(parsed) ? parsed : Date.now() + result.delaySec * 1000;
}

export function checkBackRemainingMs(result: ScheduleCheckBackResult, nowMs = Date.now()): number {
  if (result.wakeUp) return 0;
  return Math.max(0, checkBackWakeAtMs(result) - nowMs);
}

export function isCheckBackWaiting(result: ScheduleCheckBackResult, _nowMs = Date.now()): boolean {
  return !result.wakeUp;
}

export function isCheckBackOverdue(result: ScheduleCheckBackResult, nowMs = Date.now()): boolean {
  return !result.wakeUp && checkBackRemainingMs(result, nowMs) <= 0;
}

export function formatCheckBackCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function checkBackProgress(result: ScheduleCheckBackResult, nowMs = Date.now()): number {
  if (result.wakeUp) return 1;
  const totalMs = Math.max(result.delaySec * 1000, 1);
  const remaining = checkBackRemainingMs(result, nowMs);
  return Math.min(1, Math.max(0, 1 - remaining / totalMs));
}

function checkBackErrorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
}

export function isCheckBackInProgressError(err: unknown): boolean {
  const hay = checkBackErrorMessage(err);
  return hay.includes('already processing') || hay.includes('state=active');
}

export function isCheckBackAlreadyCompletedError(err: unknown): boolean {
  const hay = checkBackErrorMessage(err);
  return hay.includes('already completed');
}

export function isCheckBackNoPendingError(err: unknown): boolean {
  const hay = checkBackErrorMessage(err);
  return hay.includes('no pending check-back') || hay.includes('check-back job no longer exists');
}

export function isCheckBackTriggerSettledError(err: unknown): boolean {
  return (
    isCheckBackInProgressError(err) ||
    isCheckBackAlreadyCompletedError(err) ||
    isCheckBackNoPendingError(err)
  );
}
