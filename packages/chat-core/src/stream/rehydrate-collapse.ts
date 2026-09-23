import type { ChatTurn, ChatToolRun } from '../state.js';

/** Content the backend writes for assistant history rows that only carry tool updates. */
const TOOL_ONLY_PLACEHOLDERS = new Set(['[tool update]', '[tools]']);

export function isToolOnlyPlaceholderText(text: string | undefined | null): boolean {
  return TOOL_ONLY_PLACEHOLDERS.has(String(text ?? '').trim());
}

function mergeRun(original: ChatToolRun, update: ChatToolRun): ChatToolRun {
  return {
    ...original,
    ...update,
    // Later updates are often status-only rows (resume / retry / follow-up patch).
    args: Object.keys(update.args || {}).length ? update.args : original.args,
    tool: update.tool && update.tool !== 'tool' ? update.tool : original.tool,
    label: original.label || update.label,
    round: original.round ?? update.round,
  };
}

/**
 * Portal history is append-only: a resumed / retried / follow-up-patched tool call
 * is persisted again in a later message with its new state. Fold every later row
 * into the first turn that holds that callId (later state wins) and drop assistant
 * turns left with nothing but a tool-update placeholder.
 */
export function collapseRepeatedToolRows(turns: ChatTurn[]): ChatTurn[] {
  const ownerByCallId = new Map<string, number>();
  const out: ChatTurn[] = turns.map((t) => ({ ...t, toolEvents: [...(t.toolEvents || [])] }));
  const dropped = new Set<number>();

  out.forEach((turn, idx) => {
    if (turn.role !== 'assistant') return;
    const kept: ChatToolRun[] = [];
    for (const run of turn.toolEvents || []) {
      const ownerIdx = ownerByCallId.get(run.id);
      if (ownerIdx === undefined) {
        ownerByCallId.set(run.id, idx);
        kept.push(run);
        continue;
      }
      const owner = out[ownerIdx]!;
      owner.toolEvents = (owner.toolEvents || []).map((r) =>
        r.id === run.id ? mergeRun(r, run) : r,
      );
    }
    turn.toolEvents = kept;
    if (isToolOnlyPlaceholderText(turn.text)) {
      turn.text = '';
      if (!kept.length && !(turn.attachments || []).length) dropped.add(idx);
    }
  });

  return out.filter((_, idx) => !dropped.has(idx));
}
