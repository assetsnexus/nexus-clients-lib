import { describe, expect, it } from 'vitest';
import {
  defaultSessionPaths,
  describeCapabilities,
  normalizeMountPath,
  normalizeMountSession,
  validateMountSessions,
  type MountCapabilities,
} from './mount-session.js';

const capsKernel: MountCapabilities = { platform: 'linux', driver: 'fuse', helperPresent: true, helperPath: '/usr/bin/fusermount3' };
const capsMirror: MountCapabilities = { platform: 'linux', driver: 'fuse', helperPresent: false, helperPath: null };

const now = () => new Date('2026-03-01T00:00:00.000Z');

describe('describeCapabilities', () => {
  it('uses kernel mode when the helper is present', () => {
    expect(describeCapabilities(capsKernel)).toEqual({ delivery: 'kernel', warnings: [] });
  });

  it('falls back to the mirror daemon with a warning when it is not', () => {
    const out = describeCapabilities(capsMirror);
    expect(out.delivery).toBe('mirror');
    expect(out.warnings[0]).toMatch(/native fuse helper not found/);
  });
});

describe('normalizeMountSession', () => {
  it('builds a session with mirrored cache/journal paths', () => {
    const { session } = normalizeMountSession(
      { workspaceId: 'w1', remoteFolderPath: 'Projects/Clients/', mountpoint: '/home/me/nexus/clients', mode: 'read-write' },
      { id: 'm1', baseDir: '/home/me/.nexus', caps: capsKernel, now },
    );
    expect(session.delivery).toBe('kernel');
    expect(session.mode).toBe('read-write');
    expect(session.remoteFolderPath).toBe('/Projects/Clients');
    expect(session.cacheDir).toBe('/home/me/.nexus/cache/_home_me_nexus_clients');
    expect(session.journalPath).toBe('/home/me/.nexus/cache/_home_me_nexus_clients.journal.jsonl');
    expect(session.state).toBe('stopped');
  });

  it('downgrades to mirror delivery and warns on a relative mountpoint', () => {
    const { session, warnings } = normalizeMountSession(
      { workspaceId: 'w1', mountpoint: 'relative/dir' },
      { id: 'm2', baseDir: '/base', caps: capsMirror, now },
    );
    expect(session.delivery).toBe('mirror');
    expect(session.mode).toBe('read-only');
    expect(warnings.some((w) => /absolute/.test(w))).toBe(true);
    expect(warnings.some((w) => /mirror/.test(w))).toBe(true);
  });

  it('honours an explicit delivery override', () => {
    const { session } = normalizeMountSession(
      { workspaceId: 'w1', mountpoint: '/mnt/n', delivery: 'mirror' },
      { id: 'm3', baseDir: '/base', caps: capsKernel, now },
    );
    expect(session.delivery).toBe('mirror');
  });
});

describe('defaultSessionPaths', () => {
  it('slugs unsafe characters', () => {
    expect(defaultSessionPaths('/mnt/nexus dir/../x', '/base')).toEqual({
      cacheDir: '/base/cache/_mnt_nexus_dir_.._x',
      journalPath: '/base/cache/_mnt_nexus_dir_.._x.journal.jsonl',
    });
  });
});

describe('normalizeMountPath', () => {
  it('normalizes to a leading slash', () => {
    expect(normalizeMountPath('a//b/')).toBe('/a/b');
    expect(normalizeMountPath('')).toBe('/');
  });
});

describe('validateMountSessions', () => {
  const mk = (id: string, mountpoint: string) =>
    normalizeMountSession({ workspaceId: 'w', mountpoint }, { id, baseDir: '/b', caps: capsKernel, now }).session;

  it('accepts distinct mountpoints', () => {
    expect(validateMountSessions([mk('a', '/mnt/a'), mk('b', '/mnt/b')])).toEqual([]);
  });

  it('flags duplicate mountpoints case-insensitively', () => {
    const issues = validateMountSessions([mk('a', '/mnt/X'), mk('b', '/mnt/x/')]);
    expect(issues.filter((i) => /mountpoint/.test(i.message)).length).toBe(2);
  });

  it('flags a relative mountpoint', () => {
    const bad = mk('a', 'rel/dir');
    expect(validateMountSessions([bad]).some((i) => /absolute/.test(i.message))).toBe(true);
  });
});
