export type HistoryTurn = { id: string; role?: string; text?: string; toolEvents?: unknown[] };

/** Older pages are prepended. Existing ids, including the live streaming turn, stay put. */
export function mergePrependedTurns<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((turn) => turn.id));
  const older = incoming.filter((turn) => turn?.id && !seen.has(turn.id));
  return [...older, ...existing];
}

/**
 * Upsert by id: an incoming turn with an existing id **replaces** it in place
 * (so a cached preview gains its full body), and a new id is appended in the
 * order received. Used by the forward delta, where the fetch may re-include
 * the newest cached turn to refresh its body.
 */
export function mergeAppendedTurns<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  if (!incoming.length) return existing;
  const index = new Map(existing.map((turn, i) => [turn.id, i]));
  const next = [...existing];
  for (const turn of incoming) {
    if (!turn?.id) continue;
    const at = index.get(turn.id);
    if (at == null) {
      index.set(turn.id, next.length);
      next.push(turn);
    } else {
      next[at] = turn;
    }
  }
  return next;
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
