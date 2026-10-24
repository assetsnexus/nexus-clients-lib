/**
 * Session-row action matrix, mirroring the portal's `contextMenuActionsForKind`.
 *
 * Kept in a dependency-free module so the matrix can be unit-tested without
 * pulling in the React inbox (which reaches for optional avatar peers).
 *
 * A two-person room presents as a DM until a third participant joins, so it
 * never offers leave-group or room settings.
 */
import type { InboxRow } from './inboxRows.js';

/** Row actions exposed through the kebab menu / right-click (portal parity). */
export type InboxRowAction =
  | 'rename'
  | 'archive'
  | 'delete'
  | 'leave_group'
  | 'reset'
  | 'room_settings';

export const ROW_ACTION_LABELS: Record<InboxRowAction, string> = {
  rename: 'Rename',
  archive: 'Archive',
  delete: 'Delete',
  leave_group: 'Leave group',
  reset: 'Reset conversation',
  room_settings: 'Room settings',
};

export function rowActionsFor(row: Pick<InboxRow, 'kind'>): InboxRowAction[] {
  if (row.kind === 'group') return ['rename', 'archive', 'leave_group', 'room_settings'];
  if (row.kind === 'agent') return ['rename', 'archive', 'delete', 'reset'];
  return ['rename', 'archive', 'delete'];
}
