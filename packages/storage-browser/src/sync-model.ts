/**
 * Multi-sync binding model (Phase 3).
 *
 * A *sync* links one **Nexus storage bucket sub-directory** (a folder, or the
 * bucket root) to one **local directory**, and keeps them in step. Multiple
 * syncs run side by side — the same bucket can be linked to several local
 * directories, a different sub-dir to each, and different buckets at once.
 *
 * This module is pure and OS-agnostic: the Electron main process owns the file
 * IO and the region commands, while the shape, validation, and matching rules
 * live here so they are identical in the desktop app, the CLI, and tests.
 */

export type SyncMode = 'two-way' | 'download-only' | 'upload-only';
export type ConflictPolicy = 'newest-wins' | 'local-wins' | 'remote-wins' | 'keep-both';

export const SYNC_MODES: readonly SyncMode[] = ['two-way', 'download-only', 'upload-only'];
export const CONFLICT_POLICIES: readonly ConflictPolicy[] = [
  'newest-wins',
  'local-wins',
  'remote-wins',
  'keep-both',
];

/**
 * One bucket-subdir -> local-dir link.
 *
 * `remoteFolderId === null` means the whole bucket/workspace root; otherwise it
 * is the folder id of the sub-directory. `remoteFolderPath` is a human label
 * (e.g. `/Projects/Clients`) so the UI can show the link without re-walking the
 * folder tree.
 */
export type SyncBinding = {
  id: string;
  /** User-facing label; unique per install. */
  name: string;
  workspaceId: string;
  /** Remote sub-directory folder id, or null for the bucket root. */
  remoteFolderId: string | null;
  /** Display path of the remote sub-directory (e.g. `/Projects/Clients`). */
  remoteFolderPath: string;
  /** Absolute local directory. */
  localDir: string;
  mode: SyncMode;
  conflictPolicy: ConflictPolicy;
  enabled: boolean;
  /** Poll interval in seconds; 0 means manual-only (Sync now). */
  intervalSeconds: number;
  /** Glob-ish prefixes (relative path) to skip, e.g. `node_modules`, `.git`. */
  exclude: string[];
  createdAt: string;
  updatedAt: string;
};

export type SyncBindingInput = {
  name: string;
  workspaceId: string;
  remoteFolderId?: string | null;
  remoteFolderPath?: string;
  localDir: string;
  mode?: SyncMode;
  conflictPolicy?: ConflictPolicy;
  enabled?: boolean;
  intervalSeconds?: number;
  exclude?: string[];
};

export const DEFAULT_EXCLUDES: readonly string[] = ['.DS_Store', 'Thumbs.db', '.git', 'node_modules'];

/**
 * Normalize + validate a raw binding input into a `SyncBinding`.
 * Returns the binding plus any soft warnings (downgrades / clamps).
 */
export function normalizeSyncBinding(
  input: SyncBindingInput,
  opts: { id: string; now?: () => Date },
): { binding: SyncBinding; warnings: string[] } {
  const warnings: string[] = [];
  const now = (opts.now ?? (() => new Date()))().toISOString();

  const mode: SyncMode = SYNC_MODES.includes(input.mode as SyncMode)
    ? (input.mode as SyncMode)
    : input.mode
      ? (warnings.push(`unknown mode ${input.mode}; defaulted to two-way`), 'two-way')
      : 'two-way';

  const conflictPolicy: ConflictPolicy = CONFLICT_POLICIES.includes(input.conflictPolicy as ConflictPolicy)
    ? (input.conflictPolicy as ConflictPolicy)
    : input.conflictPolicy
      ? (warnings.push(`unknown conflictPolicy ${input.conflictPolicy}; defaulted to newest-wins`), 'newest-wins')
      : 'newest-wins';

  let intervalSeconds = Number.isFinite(input.intervalSeconds) ? Math.floor(input.intervalSeconds as number) : 300;
  if (intervalSeconds < 0) {
    warnings.push('intervalSeconds was negative; clamped to 0 (manual only)');
    intervalSeconds = 0;
  }
  if (intervalSeconds > 0 && intervalSeconds < 15) {
    warnings.push('intervalSeconds below 15s clamped to 15s');
    intervalSeconds = 15;
  }

  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Sync';
  const remoteFolderPath =
    typeof input.remoteFolderPath === 'string' && input.remoteFolderPath.trim()
      ? normalizeRemotePath(input.remoteFolderPath)
      : input.remoteFolderId
        ? '/'
        : '/';

  return {
    binding: {
      id: opts.id,
      name,
      workspaceId: String(input.workspaceId ?? '').trim(),
      remoteFolderId: input.remoteFolderId ?? null,
      remoteFolderPath,
      localDir: String(input.localDir ?? '').trim(),
      mode,
      conflictPolicy,
      enabled: input.enabled !== false,
      intervalSeconds,
      exclude: dedupe([...(input.exclude ?? [])].map((e) => String(e).trim()).filter(Boolean)),
      createdAt: now,
      updatedAt: now,
    },
    warnings,
  };
}

/** Apply a patch to a binding, re-normalizing the fields that can change. */
export function updateSyncBinding(
  binding: SyncBinding,
  patch: Partial<SyncBindingInput>,
  now: () => Date = () => new Date(),
): { binding: SyncBinding; warnings: string[] } {
  const merged: SyncBindingInput = {
    name: patch.name ?? binding.name,
    workspaceId: patch.workspaceId ?? binding.workspaceId,
    remoteFolderId: patch.remoteFolderId !== undefined ? patch.remoteFolderId : binding.remoteFolderId,
    remoteFolderPath:
      patch.remoteFolderPath !== undefined ? patch.remoteFolderPath : binding.remoteFolderPath,
    localDir: patch.localDir ?? binding.localDir,
    mode: patch.mode ?? binding.mode,
    conflictPolicy: patch.conflictPolicy ?? binding.conflictPolicy,
    enabled: patch.enabled ?? binding.enabled,
    intervalSeconds: patch.intervalSeconds ?? binding.intervalSeconds,
    exclude: patch.exclude ?? binding.exclude,
  };
  const result = normalizeSyncBinding(merged, { id: binding.id, now });
  return { binding: { ...result.binding, createdAt: binding.createdAt }, warnings: result.warnings };
}

export type BindingIssue = {
  bindingId: string;
  field: 'name' | 'workspaceId' | 'localDir' | 'remoteDir' | 'general';
  message: string;
};

/**
 * Validate a set of bindings. Enforces the invariants of *managing multiple
 * syncs*: unique names, unique local directories (two syncs writing the same
 * local dir would fight), and unique remote sub-dir per workspace.
 */
export function validateSyncBindings(bindings: SyncBinding[]): BindingIssue[] {
  const issues: BindingIssue[] = [];
  const byName = new Map<string, number>();
  const byLocal = new Map<string, number>();
  const byRemote = new Map<string, number>();

  for (const b of bindings) {
    if (!b.name) issues.push({ bindingId: b.id, field: 'name', message: 'name is required' });
    if (!b.workspaceId) {
      issues.push({ bindingId: b.id, field: 'workspaceId', message: 'workspace is required' });
    }
    if (!b.localDir) {
      issues.push({ bindingId: b.id, field: 'localDir', message: 'local directory is required' });
    } else if (!isAbsolutePath(b.localDir)) {
      issues.push({ bindingId: b.id, field: 'localDir', message: 'local directory must be absolute' });
    }

    const nameKey = b.name.toLowerCase();
    byName.set(nameKey, (byName.get(nameKey) ?? 0) + 1);
    const localKey = normalizeLocalKey(b.localDir);
    if (localKey) byLocal.set(localKey, (byLocal.get(localKey) ?? 0) + 1);
    // Only a *writing* sync can corrupt a remote sub-dir; a download-only sync
    // sharing a sub-dir with another reader is fine.
    if (b.mode !== 'download-only') {
      const remoteKey = `${b.workspaceId}::${b.remoteFolderId ?? 'root'}`;
      byRemote.set(remoteKey, (byRemote.get(remoteKey) ?? 0) + 1);
    }
  }

  for (const b of bindings) {
    if ((byName.get(b.name.toLowerCase()) ?? 0) > 1) {
      issues.push({ bindingId: b.id, field: 'name', message: 'another sync already uses this name' });
    }
    const localKey = normalizeLocalKey(b.localDir);
    if (localKey && (byLocal.get(localKey) ?? 0) > 1) {
      issues.push({
        bindingId: b.id,
        field: 'localDir',
        message: 'another sync already targets this local directory',
      });
    }
    if (b.mode === 'download-only') continue;
    const remoteKey = `${b.workspaceId}::${b.remoteFolderId ?? 'root'}`;
    if ((byRemote.get(remoteKey) ?? 0) > 1) {
      issues.push({
        bindingId: b.id,
        field: 'remoteDir',
        message: 'another writing sync already targets this bucket sub-directory',
      });
    }
  }

  return issues;
}

// ─── Registry helpers (pure) ────────────────────────────────────────────────

export function addSyncBinding(
  bindings: SyncBinding[],
  input: SyncBindingInput,
  opts: { id: string; now?: () => Date },
): { bindings: SyncBinding[]; binding: SyncBinding; warnings: string[]; issues: BindingIssue[] } {
  const { binding, warnings } = normalizeSyncBinding(input, opts);
  const next = [...bindings, binding];
  return { bindings: next, binding, warnings, issues: validateSyncBindings(next) };
}

export function removeSyncBinding(bindings: SyncBinding[], id: string): SyncBinding[] {
  return bindings.filter((b) => b.id !== id);
}

export function findSyncBinding(bindings: SyncBinding[], id: string): SyncBinding | null {
  return bindings.find((b) => b.id === id) ?? null;
}

// ─── Matching / excludes ────────────────────────────────────────────────────

/** Normalize a remote display path to a leading-slash form. */
export function normalizeRemotePath(path: string): string {
  const trimmed = String(path ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/g, '');
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** True when a relative path is excluded by any pattern (prefix or substring-of-segment). */
export function isExcluded(relPath: string, exclude: string[]): boolean {
  if (!relPath) return false;
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  for (const raw of exclude) {
    const pattern = String(raw ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!pattern) continue;
    if (pattern.includes('/')) {
      // Path prefix match.
      if (normalized === pattern || normalized.startsWith(`${pattern}/`)) return true;
    } else {
      // Bare name: match any segment.
      if (segments.includes(pattern)) return true;
    }
  }
  return false;
}

// ─── internal ───────────────────────────────────────────────────────────────

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

function normalizeLocalKey(p: string): string {
  return String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase();
}
