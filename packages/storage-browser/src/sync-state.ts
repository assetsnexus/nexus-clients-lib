/**
 * Sync state file (Phase 3) — the *proof* a path was previously synced.
 *
 * The reconcile engine deliberately never infers a delete from a missing path:
 * a wiped local directory must not erase the bucket. To make deletes safe we
 * keep a per-binding state file recording, for every path that has successfully
 * synced at least once:
 *   - the content hash + size + mtime we last saw on each side, and
 *   - the **remote revision number** (`revisionNo`) we last synced against.
 *
 * A delete is only emitted when the state proves the path existed on *both*
 * sides and has since disappeared from exactly one of them — never on a first
 * sighting, and never when the state has no row (e.g. a freshly added binding).
 *
 * The revision number is the same value `FileEditGuardService` appends on every
 * guarded write, so a remote revision greater than the one we recorded means
 * *someone else* changed the file since our last sync — an authoritative
 * conflict signal that does not depend on clock skew between machines.
 */

import type { ConflictPolicy, SyncMode } from './sync-model.js';
import type { LocalEntry, RemoteEntry, SyncAction } from './sync-engine.js';

/** One synced path's last-known state on both sides. */
export type SyncStateEntry = {
  relPath: string;
  /** Content hash of the last synced bytes (sha256 hex, or a synthetic key). */
  hash: string | null;
  size: number;
  /** Local mtime, epoch ms, at the last successful sync. */
  localMtimeMs: number;
  /** Remote mtime, epoch ms, at the last successful sync. */
  remoteMtimeMs: number;
  /** Remote revision number at the last successful sync. */
  remoteRevision: number | null;
  /** Remote file id at the last successful sync (for deletes). */
  remoteFileId: string | null;
  /** When the row was last written. */
  syncedAt: string;
};

export type SyncState = {
  bindingId: string;
  entries: Record<string, SyncStateEntry>;
};

export function emptySyncState(bindingId: string): SyncState {
  return { bindingId, entries: {} };
}

/** The revision we last synced a path against, or null when unknown. */
export function syncedRevisionOf(state: SyncState, relPath: string): number | null {
  return state.entries[relPath]?.remoteRevision ?? null;
}

/**
 * Record the outcome of one successful sync pass. Only paths that now exist on
 * both sides (or were created on one side) are recorded; a path the run deleted
 * is removed from the state so it is not re-deleted next pass.
 */
export function recordSyncState(
  state: SyncState,
  input: {
    local: LocalEntry[];
    remote: RemoteEntry[];
    deleted: string[];
    /** Resolved content hash per relPath, when the caller computed one. */
    hashes?: Record<string, string | null>;
    now?: () => Date;
  },
): SyncState {
  const at = (input.now ?? (() => new Date()))().toISOString();
  const next: Record<string, SyncStateEntry> = { ...state.entries };
  const deleted = new Set(input.deleted);
  for (const relPath of deleted) delete next[relPath];

  const localMap = new Map(input.local.map((e) => [e.relPath, e]));
  const remoteMap = new Map(input.remote.map((e) => [e.relPath, e]));

  for (const [relPath, l] of localMap) {
    const r = remoteMap.get(relPath);
    if (l.kind !== 'file') continue;
    if (!r) continue; // not synced to remote yet; don't claim a row
    next[relPath] = {
      relPath,
      hash: input.hashes?.[relPath] ?? r.hash ?? null,
      size: r.size ?? l.size,
      localMtimeMs: l.mtimeMs,
      remoteMtimeMs: r.mtimeMs,
      remoteRevision: r.revision ?? null,
      remoteFileId: r.fileId,
      syncedAt: at,
    };
  }
  for (const [relPath, r] of remoteMap) {
    if (r.kind !== 'file' || next[relPath]) continue;
    next[relPath] = {
      relPath,
      hash: r.hash ?? null,
      size: r.size,
      localMtimeMs: localMap.get(relPath)?.mtimeMs ?? 0,
      remoteMtimeMs: r.mtimeMs,
      remoteRevision: r.revision ?? null,
      remoteFileId: r.fileId,
      syncedAt: at,
    };
  }

  return { bindingId: state.bindingId, entries: next };
}

export type DeletionPlan = {
  /** Paths to delete locally (they were synced, then removed from the remote). */
  deleteLocal: SyncAction[];
  /** Paths to delete remotely (they were synced, then removed locally). */
  deleteRemote: SyncAction[];
  /**
   * Paths that vanished on one side but changed on the other since our last
   * sync — deleting would lose an edit, so they are surfaced as conflicts.
   */
  conflicts: SyncAction[];
};

/**
 * Decide the deletions for one pass, using the state file as proof.
 *
 * Rules (per state row, keyed by relPath):
 * - Row exists, now missing locally, still remote:
 *   - download-only/upload-only modes: never delete; surface as conflict-free
 *     "resurrect" by letting the normal reconcile handle it (skip here).
 *   - two-way: if the remote revision advanced past the recorded revision, the
 *     remote changed since we last saw it, so deleting remotely would lose work
 *     -> conflict. Otherwise the local side is the sole change -> delete remote.
 * - Row exists, now missing remotely, still local:
 *   - two-way: if the local mtime advanced past the recorded local mtime, the
 *     local changed after the remote vanished -> conflict. Otherwise delete local.
 * - Row exists, missing on BOTH sides: the path was deleted on both; drop the row.
 * - No row: never delete (first sighting — safe default).
 */
export function planDeletions(
  state: SyncState,
  local: LocalEntry[],
  remote: RemoteEntry[],
  opts: { mode: SyncMode; conflictPolicy: ConflictPolicy },
): DeletionPlan {
  const deleteLocal: SyncAction[] = [];
  const deleteRemote: SyncAction[] = [];
  const conflicts: SyncAction[] = [];
  const localMap = new Map(local.map((e) => [e.relPath, e]));
  const remoteMap = new Map(remote.map((e) => [e.relPath, e]));

  if (opts.mode !== 'two-way') {
    // One-way modes never delete: the source side defines existence.
    return { deleteLocal, deleteRemote, conflicts };
  }

  for (const entry of Object.values(state.entries)) {
    const l = localMap.get(entry.relPath);
    const r = remoteMap.get(entry.relPath);
    if (l && r) continue; // both still present
    if (!l && !r) continue; // gone on both; reconcile state prunes it

    if (!l && r) {
      // Removed locally, still remote.
      const remoteChanged =
        entry.remoteRevision != null && r.revision != null && r.revision > entry.remoteRevision;
      if (remoteChanged) {
        conflicts.push({
          kind: 'conflict',
          relPath: entry.relPath,
          reason: 'deleted locally but remote changed since last sync',
          resolution: 'none',
          fileId: r.fileId,
        });
      } else {
        deleteRemote.push({
          kind: 'delete-remote',
          relPath: entry.relPath,
          reason: 'removed locally (previously synced)',
          fileId: r.fileId,
        });
      }
      continue;
    }

    if (l && !r) {
      // Removed remotely, still local.
      const localChanged = l.mtimeMs > entry.localMtimeMs;
      if (localChanged) {
        conflicts.push({
          kind: 'conflict',
          relPath: entry.relPath,
          reason: 'removed remotely but edited locally since last sync',
          resolution: 'none',
        });
      } else {
        deleteLocal.push({
          kind: 'delete-local',
          relPath: entry.relPath,
          reason: 'removed remotely (previously synced)',
        });
      }
    }
  }

  return { deleteLocal, deleteRemote, conflicts };
}

/** Drop state rows that are no longer relevant (both sides gone). */
export function pruneSyncState(state: SyncState, keep: string[]): SyncState {
  const keepSet = new Set(keep);
  const entries: Record<string, SyncStateEntry> = {};
  for (const [k, v] of Object.entries(state.entries)) {
    if (keepSet.has(k)) entries[k] = v;
  }
  return { bindingId: state.bindingId, entries };
}
