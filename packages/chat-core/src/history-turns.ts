export type HistoryTurn = { id: string; role?: string; text?: string; toolEvents?: unknown[] };

/** Older pages are prepended. Existing ids, including the live streaming turn, stay put. */
export function mergePrependedTurns<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((turn) => turn.id));
  const older = incoming.filter((turn) => turn?.id && !seen.has(turn.id));
  return [...older, ...existing];
}

/**
 * Room sends only grow an assistant bubble when someone will answer.
 * A missing plan keeps the bubble so older servers still stream.
 */
export function shouldKeepRoomAssistantPlaceholder(
  aiDispatch: { responders?: unknown[] } | null | undefined,
): boolean {
  if (!aiDispatch || !Array.isArray(aiDispatch.responders)) return true;
  return aiDispatch.responders.length > 0;
}

/**
 * Apply a room dispatch plan that arrives after the send (stream or socket).
 * No responders drops the empty assistant placeholder and records why.
 */
export function applyRoomDispatchPlan<T extends { id: string }>(
  turns: T[],
  assistantId: string | null,
  plan: { responders?: unknown[]; skippedReason?: string | null } | null | undefined,
): { turns: T[]; lastDispatchSkip: string | null; dropped: boolean } {
  if (shouldKeepRoomAssistantPlaceholder(plan)) {
    return { turns, lastDispatchSkip: null, dropped: false };
  }
  const skip =
    plan && typeof plan.skippedReason === 'string' && plan.skippedReason
      ? plan.skippedReason
      : 'no_ai_participants';
  if (!assistantId) return { turns, lastDispatchSkip: skip, dropped: false };
  const next = turns.filter((turn) => turn.id !== assistantId);
  return { turns: next, lastDispatchSkip: skip, dropped: next.length !== turns.length };
}
