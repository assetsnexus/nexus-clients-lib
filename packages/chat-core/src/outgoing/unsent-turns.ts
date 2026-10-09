export type UnsentTurnLike = {
  id: string;
  role?: string | null;
  deliveryStatus?: string | null;
};

/**
 * Local optimistic rows only. Server history has no deliveryStatus, and a
 * `sent` row already reached Nexus.
 */
export function isDiscardableUnsentUserTurn(turn: UnsentTurnLike): boolean {
  return turn.role === 'user' && (turn.deliveryStatus === 'failed' || turn.deliveryStatus === 'sending');
}

export function latestUnsentUserTurnId(turns: UnsentTurnLike[]): string | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn && isDiscardableUnsentUserTurn(turn)) return turn.id;
  }
  return null;
}

export function discardableUnsentTurnIds(turns: UnsentTurnLike[], requested: string[]): string[] {
  const wanted = new Set(requested.filter((id) => typeof id === 'string' && id.trim()));
  if (!wanted.size) return [];
  return turns.filter((turn) => wanted.has(turn.id) && isDiscardableUnsentUserTurn(turn)).map((turn) => turn.id);
}
