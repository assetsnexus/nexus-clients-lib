/**
 * Sync reconcile engine (Phase 3).
 *
 * Pure decision logic for keeping a local directory and a remote bucket
 * sub-directory in step. Given the *current* local entries and *current* remote
 * entries, it emits the action list the main process executes (download,
 * upload, delete, skip, conflict).
 *
 * Keeping this pure is what makes "multiple syncs" safe: the same rules run for
 * every binding, and every decision is unit-testable without touching disk or
 * the region. The main process only performs IO for the returned actions.
 */

import type { ConflictPolicy, SyncMode } from './sync-model.js';
import { normalizeRemotePath } from './sync-model.js';

/** An entry on the local side (file or directory). */
export type LocalEntry = {
  /** Path relative to the sync root, POSIX-separated. */
  relPath: string;
  kind: 'file' | 'dir';
  /** File size in bytes (0 for dirs). */
  size: number;
  /** Last modified time, epoch ms. */
  mtimeMs: number;
  /** Content hash when known (used to detect a real change vs a touch). */
  hash?: string | null;
};

/** An entry on the remote side. */
export type RemoteEntry = {
  /** Path relative to the sync root, POSIX-separated. */
  relPath: string;
  kind: 'file' | 'dir';
  size: number;
  /** Last modified time, epoch ms (derived from the region record). */
  mtimeMs: number;
  hash?: string | null;
  /** Region file id (null for dirs). */
  fileId: string | null;
  /** Region revision number for optimistic concurrency. */
  revision: number | null;
};

export type SyncActionKind =
  | 'download'
  | 'upload'
  | 'delete-local'
  | 'delete-remote'
  | 'mkdir-local'
  | 'mkdir-remote'
  | 'conflict'
  | 'skip';

export type SyncAction = {
  kind: SyncActionKind;
  relPath: string;
  reason: string;
  /** For conflicts, how it was (or will be) resolved. */
  resolution?: ConflictResolution;
  /** Remote file id, set for `download` actions so the executor can fetch it. */
  fileId?: string | null;
};

export type ConflictResolution = 'local' | 'remote' | 'both' | 'none';

export type ReconcileResult = {
  actions: SyncAction[];
  /** Counts per kind, for the UI summary. */
  summary: Record<SyncActionKind, number>;
  /** Conflicts that need a decision (when the policy could not auto-resolve). */
  conflicts: SyncAction[];
};

export type ReconcileOptions = {
  mode: SyncMode;
  conflictPolicy: ConflictPolicy;
};

const emptySummary = (): Record<SyncActionKind, number> => ({
  download: 0,
  upload: 0,
  'delete-local': 0,
  'delete-remote': 0,
  'mkdir-local': 0,
  'mkdir-remote': 0,
  conflict: 0,
  skip: 0,
});

/**
 * Reconcile local vs remote entries for one sync binding.
 *
 * Rules, per path present on either side:
 * - only local  -> upload (two-way / upload-only); skip in download-only.
 * - only remote -> download (two-way / download-only); skip in upload-only.
 * - both, same content (hash, or size+mtime as fallback) -> skip.
 * - both, different   -> the newer side wins (per `conflictPolicy`); equal
 *                        mtimes that differ in content are a `conflict`.
 * - directory on one side only -> mkdir on the other.
 *
 * Deletions are *not* inferred here: a path missing on one side is treated as a
 * create, not a delete (safe default — never destroys data). Explicit deletes
 * are emitted by the caller via `deletions` when it can prove a prior sync saw
 * the path (tracked by the state file). This keeps a wiped local dir from
 * deleting the bucket.
 */
export function reconcile(
  local: LocalEntry[],
  remote: RemoteEntry[],
  opts: ReconcileOptions,
): ReconcileResult {
  const summary = emptySummary();
  const actions: SyncAction[] = [];
  const conflicts: SyncAction[] = [];

  const localMap = new Map(local.map((e) => [e.relPath, e]));
  const remoteMap = new Map(remote.map((e) => [e.relPath, e]));
  const allPaths = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

  const push = (action: SyncAction) => {
    actions.push(action);
    summary[action.kind] += 1;
    if (action.kind === 'conflict') conflicts.push(action);
  };

  for (const relPath of [...allPaths].sort()) {
    const l = localMap.get(relPath);
    const r = remoteMap.get(relPath);

    if (l && !r) {
      if (l.kind === 'dir') {
        if (opts.mode !== 'download-only') push({ kind: 'mkdir-remote', relPath, reason: 'dir only local' });
        else push({ kind: 'skip', relPath, reason: 'download-only: local dir ignored' });
        continue;
      }
      if (opts.mode === 'download-only') {
        push({ kind: 'skip', relPath, reason: 'download-only: local-only file ignored' });
      } else {
        push({ kind: 'upload', relPath, reason: 'file only local' });
      }
      continue;
    }

    if (!l && r) {
      if (r.kind === 'dir') {
        if (opts.mode !== 'upload-only') push({ kind: 'mkdir-local', relPath, reason: 'dir only remote' });
        else push({ kind: 'skip', relPath, reason: 'upload-only: remote dir ignored' });
        continue;
      }
      if (opts.mode === 'upload-only') {
        push({ kind: 'skip', relPath, reason: 'upload-only: remote-only file ignored' });
      } else {
        push({ kind: 'download', relPath, reason: 'file only remote', fileId: r.fileId });
      }
      continue;
    }

    // Both sides present.
    if (l && r && l.kind !== r.kind) {
      // A file replaced a dir (or vice versa) — surface as a conflict.
      push({ kind: 'conflict', relPath, reason: 'kind mismatch (file vs dir)', resolution: conflictResolution(opts.conflictPolicy) });
      continue;
    }

    if (l && r && l.kind === 'dir') {
      push({ kind: 'skip', relPath, reason: 'dir present both sides' });
      continue;
    }

    if (l && r) {
      if (sameContent(l, r)) {
        push({ kind: 'skip', relPath, reason: 'unchanged' });
        continue;
      }
      const decision = decideConflict(l, r, opts);
      if (decision.kind === 'conflict') {
        push(decision);
        continue;
      }
      push(decision);
    }
  }

  return { actions, summary, conflicts };
}

/**
 * Decide what to do when both sides differ. Uses the conflict policy; a genuine
 * "both changed at the same instant" is surfaced as a conflict for the UI.
 */
export function decideConflict(
  local: LocalEntry,
  remote: RemoteEntry,
  opts: ReconcileOptions,
): SyncAction {
  const { mode, conflictPolicy } = opts;
  const relPath = local.relPath;

  if (mode === 'download-only') {
    return { kind: 'download', relPath, reason: 'download-only: remote is source of truth', fileId: remote.fileId };
  }
  if (mode === 'upload-only') {
    return { kind: 'upload', relPath, reason: 'upload-only: local is source of truth' };
  }

  const resolution = conflictResolution(conflictPolicy);

  // Explicit one-sided policies short-circuit.
  if (conflictPolicy === 'local-wins') {
    return { kind: 'upload', relPath, reason: 'local-wins policy', resolution: 'local' };
  }
  if (conflictPolicy === 'remote-wins') {
    return { kind: 'download', relPath, reason: 'remote-wins policy', resolution: 'remote', fileId: remote.fileId };
  }
  if (conflictPolicy === 'keep-both') {
    return { kind: 'conflict', relPath, reason: 'keep-both: will write both copies', resolution: 'both' };
  }

  // newest-wins: compare mtimes; a tie means both changed at once -> conflict.
  if (local.mtimeMs > remote.mtimeMs) {
    return { kind: 'upload', relPath, reason: 'newest-wins: local newer', resolution: 'local' };
  }
  if (remote.mtimeMs > local.mtimeMs) {
    return { kind: 'download', relPath, reason: 'newest-wins: remote newer', resolution: 'remote', fileId: remote.fileId };
  }
  return { kind: 'conflict', relPath, reason: 'newest-wins: same mtime, different content', resolution };
}

function conflictResolution(policy: ConflictPolicy): ConflictResolution {
  switch (policy) {
    case 'local-wins':
      return 'local';
    case 'remote-wins':
      return 'remote';
    case 'keep-both':
      return 'both';
    default:
      return 'none';
  }
}

/** Same content: prefer hash when both sides have one, else size + mtime. */
export function sameContent(local: LocalEntry, remote: RemoteEntry): boolean {
  if (local.hash && remote.hash) return local.hash === remote.hash;
  // No hash: equal size and (within a 1s tolerance) equal mtime => unchanged.
  if (local.size !== remote.size) return false;
  return Math.abs(local.mtimeMs - remote.mtimeMs) < 1000;
}

/** Build the remote path of a binding's sub-dir under a bucket listing. */
export function joinRemotePath(base: string, rel: string): string {
  const b = base === '/' ? '' : base.replace(/\/+$/g, '');
  const r = String(rel ?? '').replace(/^\/+/g, '');
  return `${b}/${r}`.replace(/\/{2,}/g, '/');
}

/** Turn a region file record list into remote entries relative to a sub-dir. */
export function toRemoteEntries(
  rows: Array<{ id: string; name: string; sizeBytes: number; createdAt?: string | null; revisionNo?: number | null; folderId?: string | null }>,
  relBase = '',
): RemoteEntry[] {
  return rows.map((row) => {
    const relPath = relBase ? `${relBase}/${row.name}` : row.name;
    const mtimeMs = row.createdAt ? Date.parse(row.createdAt) || 0 : 0;
    return {
      relPath,
      kind: 'file' as const,
      size: row.sizeBytes ?? 0,
      mtimeMs,
      hash: null,
      fileId: row.id,
      revision: row.revisionNo ?? null,
    };
  });
}

export type FolderRecord = { id: string; name: string; parentFolderId: string | null };

/**
 * Resolve a remote display path (`/Projects/Clients`) to a folder id by walking
 * the flat folder list from the workspace root. Returns null for the root, and
 * `undefined` when a segment is missing (the caller can then create it).
 */
export function resolveFolderIdByPath(
  path: string,
  folders: FolderRecord[],
): { folderId: string | null } | { missingAt: string[] } {
  const segments = normalizeRemotePath(path).split('/').filter(Boolean);
  if (!segments.length) return { folderId: null };
  const childrenOf = (parentId: string | null): FolderRecord[] =>
    folders.filter((f) => (f.parentFolderId ?? null) === (parentId ?? null));
  let parent: string | null = null;
  for (let i = 0; i < segments.length; i += 1) {
    const match: FolderRecord | undefined = childrenOf(parent).find((f) => f.name === segments[i]);
    if (!match) return { missingAt: segments.slice(i) };
    parent = match.id;
  }
  return { folderId: parent };
}
