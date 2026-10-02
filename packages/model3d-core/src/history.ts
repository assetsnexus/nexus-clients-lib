import { type HistoryEntry, type ModelOp, applyOps, describeOp } from './ops';
import { type VisualModel, cloneModel } from './schema';

export const HISTORY_CAP = 50;

export interface SpatialHistory {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

export function createHistory(): SpatialHistory {
  return { undo: [], redo: [] };
}

export function pushHistory(history: SpatialHistory, entries: HistoryEntry[]): SpatialHistory {
  const undo = history.undo.concat(entries).slice(-HISTORY_CAP);
  return { undo, redo: [] };
}

export function undoHistory(history: SpatialHistory): { history: SpatialHistory; model: VisualModel | null } {
  const entry = history.undo[history.undo.length - 1];
  if (!entry) return { history, model: null };
  return {
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] },
    model: cloneModel(entry.before),
  };
}

export function redoHistory(history: SpatialHistory): { history: SpatialHistory; model: VisualModel | null } {
  const entry = history.redo[history.redo.length - 1];
  if (!entry) return { history, model: null };
  return {
    history: { undo: [...history.undo, entry], redo: history.redo.slice(0, -1) },
    model: cloneModel(entry.after),
  };
}

/** Edit a committed entry's params and replay from its `before` snapshot. Drops the redo branch. */
export function editHistoryParams(
  history: SpatialHistory,
  entryId: string,
  patch: Partial<ModelOp>,
): { history: SpatialHistory; model: VisualModel | null; warning?: string } {
  const idx = history.undo.findIndex((e) => e.id === entryId);
  if (idx < 0) return { history, model: null, warning: `unknown history ${entryId}` };
  const entry = history.undo[idx]!;
  const op: ModelOp = { ...entry.op, ...patch };
  const applied = applyOps(entry.before, [op], entry.source);
  if (!applied.entry) return { history, model: null, warning: applied.warnings[0] || 'replay failed' };
  const nextEntry: HistoryEntry = { ...applied.entry, id: entry.id, source: entry.source };
  const undo = history.undo.slice(0, idx);
  undo.push(nextEntry);
  let model = nextEntry.after;
  for (const later of history.undo.slice(idx + 1)) {
    const replay = applyOps(model, [later.op], later.source);
    if (replay.entry) model = replay.model;
  }
  return { history: { undo, redo: [] }, model };
}

export function historyLines(history: SpatialHistory, decimals = 2): string[] {
  return history.undo.map((entry) => describeOp(entry, decimals));
}

export function shouldIgnoreHistoryShortcut(target: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function historyShortcutAction(event: { key?: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: { tagName?: string; isContentEditable?: boolean } | null }): 'undo' | 'redo' | null {
  if (!event || shouldIgnoreHistoryShortcut(event.target)) return null;
  if (!(event.ctrlKey || event.metaKey)) return null;
  const key = String(event.key || '').toLowerCase();
  const code = String(event.code || '');
  if (key === 'z' || code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' || code === 'KeyY') return 'redo';
  return null;
}

const NUMERIC = /^[-0-9.,]+$/;

export interface NumericBuffer {
  text: string;
  active: boolean;
}

export function createNumericBuffer(): NumericBuffer {
  return { text: '', active: false };
}

/** Keys that feed the readout without focusing an input. */
export function numericKey(key: string): string | null {
  if (key === ',' || key === '.' || key === '-') return key;
  if (key.length === 1 && key >= '0' && key <= '9') return key;
  return null;
}

export function pushNumericKey(buffer: NumericBuffer, key: string): NumericBuffer {
  const ch = numericKey(key);
  if (!ch) return buffer;
  return { text: buffer.text + ch, active: true };
}

/** `22,44` → x,y millimetres. A third value is z. */
export function parseMmEntry(text: string): { x: number; y: number; z: number } | null {
  const trimmed = text.trim();
  if (!trimmed || !NUMERIC.test(trimmed)) return null;
  const parts = trimmed.split(/[, ]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map((p) => Number(p.replace(',', '.')));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return { x: nums[0] || 0, y: nums[1] || 0, z: nums[2] || 0 };
}
