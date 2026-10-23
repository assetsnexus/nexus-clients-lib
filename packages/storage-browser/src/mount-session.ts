/**
 * Mount session model (Phase 3, pure).
 *
 * A *mount session* makes a Nexus storage bucket (or one of its sub-directories)
 * appear as a local directory at a `mountpoint`. The daemon keeps that directory
 * materialized from the region: a content cache and a write-back journal sit
 * beside the mountpoint, and reads/writes proxy through region commands (the
 * region never exposes object-store credentials, only short-TTL single-object
 * presigns).
 *
 * Two delivery modes are supported and detected at runtime:
 *
 *  - `kernel` — a real FUSE/WinFsp/macFUSE kernel mount via an optional native
 *    helper. When the helper is present the daemon supervises it.
 *  - `mirror` — a dependency-free daemon that keeps the mountpoint directory
 *    populated from the bucket and applies local edits back (write-back
 *    journal). This is what runs when no native helper is installed, and it
 *    gives the same "bucket sub-dir is a local dir" experience.
 *
 * Everything here is pure and OS-agnostic so it is identical across platforms.
 */

import { driverForPlatform, isSafeMountRelPath, type MountDriver, type MountMode } from './mount-plan.js';

export type MountSessionMode = 'kernel' | 'mirror';
export type MountSessionState = 'stopped' | 'starting' | 'mounted' | 'degraded' | 'error';

/** One bucket (or sub-dir) projected to a local mountpoint. */
export type MountSession = {
  id: string;
  /** Workspace / bucket id. */
  workspaceId: string;
  /** Remote sub-directory folder id, or null for the bucket root. */
  remoteFolderId: string | null;
  /** Display path of the remote sub-directory (e.g. `/Projects/Clients`). */
  remoteFolderPath: string;
  mountpoint: string;
  mode: MountMode;
  /** Delivery mode chosen for this session. */
  delivery: MountSessionMode;
  state: MountSessionState;
  /** Where the daemon keeps cached content + the write-back journal. */
  cacheDir: string;
  journalPath: string;
  /** Filesystem label shown by the OS (kernel mode). */
  volumeName: string;
  createdAt: string;
  updatedAt: string;
  /** Last error, when `state === 'error'`. */
  error: string | null;
};

export type MountSessionInput = {
  workspaceId: string;
  remoteFolderId?: string | null;
  remoteFolderPath?: string;
  mountpoint: string;
  mode?: MountMode;
  volumeName?: string;
  /** Force a delivery mode; by default the daemon picks from capability. */
  delivery?: MountSessionMode;
};

/**
 * Whether the native driver for this platform is available. `helperPresent`
 * comes from the daemon's runtime probe; when false every session falls back to
 * the mirror daemon (the caller is told via `warnings`).
 */
export type MountCapabilities = {
  platform: NodeJS.Platform;
  driver: MountDriver;
  /** Whether the native mount helper (fuse / WinFsp / macFUSE) was found. */
  helperPresent: boolean;
  helperPath: string | null;
};

export function describeCapabilities(caps: MountCapabilities): {
  delivery: MountSessionMode;
  warnings: string[];
} {
  if (caps.helperPresent) return { delivery: 'kernel', warnings: [] };
  return {
    delivery: 'mirror',
    warnings: [
      `native ${caps.driver} helper not found${
        caps.helperPath ? ` (expected ${caps.helperPath})` : ''
      }; using the mirror daemon`,
    ],
  };
}

/** Derive the cache + journal paths for a mountpoint (kept under app data). */
export function defaultSessionPaths(mountpoint: string, baseDir: string): { cacheDir: string; journalPath: string } {
  const slug = mountpoint.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'mount';
  const cacheDir = `${baseDir.replace(/[\\/]+$/, '')}/cache/${slug}`;
  return { cacheDir, journalPath: `${cacheDir}.journal.jsonl` };
}

export function normalizeMountSession(
  input: MountSessionInput,
  opts: { id: string; baseDir: string; caps: MountCapabilities; now?: () => Date },
): { session: MountSession; warnings: string[] } {
  const warnings: string[] = [];
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const { delivery: fallback, warnings: capWarnings } = describeCapabilities(opts.caps);
  warnings.push(...capWarnings);

  const mountpoint = String(input.mountpoint ?? '').trim();
  if (!isAbsolutePath(mountpoint)) warnings.push(`mountpoint must be absolute: ${mountpoint}`);
  if (!isSafeMountRelPath(mountpoint)) warnings.push(`mountpoint has unsafe path segments`);

  const mode: MountMode = input.mode === 'read-write' ? 'read-write' : 'read-only';
  const delivery: MountSessionMode = input.delivery ?? fallback;
  const paths = defaultSessionPaths(mountpoint, opts.baseDir);

  return {
    session: {
      id: opts.id,
      workspaceId: String(input.workspaceId ?? '').trim(),
      remoteFolderId: input.remoteFolderId ?? null,
      remoteFolderPath: normalizeMountPath(input.remoteFolderPath ?? '/'),
      mountpoint,
      mode,
      delivery,
      state: 'stopped',
      cacheDir: paths.cacheDir,
      journalPath: paths.journalPath,
      volumeName: input.volumeName ?? 'Nexus',
      createdAt: now,
      updatedAt: now,
      error: null,
    },
    warnings,
  };
}

/** Normalize a remote display path to a leading-slash form. */
export function normalizeMountPath(path: string): string {
  const trimmed = String(path ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/g, '');
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Validate a set of mount sessions (unique mountpoints + ids). */
export function validateMountSessions(sessions: MountSession[]): Array<{ id: string; message: string }> {
  const issues: Array<{ id: string; message: string }> = [];
  const byMount = new Map<string, number>();
  for (const s of sessions) {
    const key = s.mountpoint.replace(/[\\/]+$/g, '').toLowerCase();
    byMount.set(key, (byMount.get(key) ?? 0) + 1);
  }
  for (const s of sessions) {
    if (!s.mountpoint || !isAbsolutePath(s.mountpoint)) {
      issues.push({ id: s.id, message: 'mountpoint must be absolute' });
    }
    const key = s.mountpoint.replace(/[\\/]+$/g, '').toLowerCase();
    if ((byMount.get(key) ?? 0) > 1) {
      issues.push({ id: s.id, message: 'another mount already uses this mountpoint' });
    }
  }
  return issues;
}

/** The driver a session's platform uses (informational; the daemon owns the probe). */
export function sessionDriver(platform: NodeJS.Platform): MountDriver {
  return driverForPlatform(platform);
}

function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}
