/**
 * Mount plan model (Phase 3 scaffolding).
 *
 * The OS-level mount daemon (FUSE / WinFsp / macFUSE-or-NFS) is a separate
 * native deliverable. What lives here is the *plan* — which bucket maps to which
 * local mountpoint, on which OS, with which mode, and how the daemon proxies
 * reads/writes through region commands (region never exposes object-store creds,
 * only short-TTL single-object presigns).
 *
 * Pure and OS-agnostic so it is unit-testable and identical across platforms.
 */

export type MountMode = 'read-only' | 'read-write';
export type MountDriver = 'fuse' | 'winfsp' | 'macfuse' | 'nfs';

export type MountBinding = {
  id: string;
  /** Region storage workspace / bucket id. */
  workspaceId: string;
  /** Local directory the bucket appears under. */
  mountpoint: string;
  mode: MountMode;
  /** Cached data directory; the daemon keeps a content-addressed cache here. */
  cacheDir: string;
  /** Offline write-back journal file. */
  journalPath: string;
};

export type MountPlan = {
  driver: MountDriver;
  bindings: MountBinding[];
  /** Filesystem label shown by the OS. */
  volumeName: string;
  warnings: string[];
};

/** Pick the native mount driver for a platform. */
export function driverForPlatform(platform: NodeJS.Platform): MountDriver {
  switch (platform) {
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'fuse';
    case 'win32':
      return 'winfsp';
    case 'darwin':
      return 'macfuse';
    default:
      return 'nfs';
  }
}

/**
 * Build a mount plan from bindings. Validates that mountpoints are absolute,
 * unique, and that a read-write binding has a writable cache + journal.
 * Read-write is only allowed when the region workspace grants it (the caller
 * passes `workspaceWritable`).
 */
export function buildMountPlan(input: {
  platform: NodeJS.Platform;
  bindings: Array<Omit<MountBinding, 'mode'> & { mode?: MountMode; workspaceWritable?: boolean }>;
  volumeName?: string;
}): MountPlan {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const bindings: MountBinding[] = [];

  for (const raw of input.bindings) {
    if (!isAbsolutePath(raw.mountpoint)) {
      warnings.push(`mountpoint must be absolute: ${raw.mountpoint}`);
      continue;
    }
    if (seen.has(raw.mountpoint)) {
      warnings.push(`duplicate mountpoint: ${raw.mountpoint}`);
      continue;
    }
    let mode: MountMode = raw.mode ?? 'read-only';
    if (mode === 'read-write' && raw.workspaceWritable === false) {
      warnings.push(`workspace ${raw.workspaceId} is not writable; downgraded to read-only`);
      mode = 'read-only';
    }
    seen.add(raw.mountpoint);
    bindings.push({
      id: raw.id,
      workspaceId: raw.workspaceId,
      mountpoint: raw.mountpoint,
      mode,
      cacheDir: raw.cacheDir,
      journalPath: raw.journalPath,
    });
  }

  return {
    driver: driverForPlatform(input.platform),
    bindings,
    volumeName: input.volumeName ?? 'Nexus',
    warnings,
  };
}

function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  // POSIX absolute, or a Windows drive/UNC path.
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

/**
 * True when a path segment is safe inside a mounted bucket (no traversal).
 * The daemon applies this before touching the cache or journal.
 */
export function isSafeMountRelPath(rel: string): boolean {
  if (typeof rel !== 'string' || !rel) return false;
  if (rel.includes('\0')) return false;
  const parts = rel.split(/[\\/]+/);
  return !parts.some((part) => part === '..' || part === '.');
}

/**
 * A read/write decision for a binding, mirroring the region's optimistic
 * concurrency: a write carries the revision it was based on, and the daemon
 * only commits when the region still reports that revision.
 */
export type JournalEntry = {
  bindingId: string;
  relPath: string;
  op: 'write' | 'delete' | 'mkdir';
  /** Base64 payload for writes. */
  contentBase64?: string;
  /** Remote file id when the mutation targets an existing object. */
  fileId?: string;
  /** Revision the write was based on, for conflict detection. */
  baseRevision: number | null;
  enqueuedAt: string;
};

export function makeJournalEntry(
  entry: Omit<JournalEntry, 'enqueuedAt'>,
  now: () => Date = () => new Date(),
): JournalEntry {
  return { ...entry, enqueuedAt: now().toISOString() };
}

/** Replay order: oldest first, never reordering concurrent edits. */
export function orderJournal(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
}
