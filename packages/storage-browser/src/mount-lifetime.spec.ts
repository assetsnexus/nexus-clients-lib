import { describe, expect, it } from 'vitest';
import {
  computeExpiresAt,
  isExpired,
  mountExpiryMs,
  normalizeMountExpiry,
} from './mount-lifetime.js';
import { normalizeMountSession, normalizePersistedMountSession } from './mount-session.js';
import type { MountCapabilities } from './mount-session.js';

const capsMirror: MountCapabilities = {
  platform: 'linux',
  driver: 'fuse',
  helperPresent: false,
  helperPath: null,
};

describe('mountExpiryMs', () => {
  it('converts minutes / hours / days / weeks to ms', () => {
    expect(mountExpiryMs({ value: 15, unit: 'minutes' })).toBe(15 * 60_000);
    expect(mountExpiryMs({ value: 2, unit: 'hours' })).toBe(2 * 3_600_000);
    expect(mountExpiryMs({ value: 3, unit: 'days' })).toBe(3 * 86_400_000);
    expect(mountExpiryMs({ value: 1, unit: 'weeks' })).toBe(604_800_000);
  });

  it('rejects a non-positive or malformed value', () => {
    expect(mountExpiryMs(null)).toBeNull();
    expect(mountExpiryMs({ value: 0, unit: 'hours' })).toBeNull();
    expect(mountExpiryMs({ value: -5, unit: 'hours' })).toBeNull();
    expect(mountExpiryMs({ value: 1, unit: 'fortnights' as never })).toBeNull();
  });
});

describe('computeExpiresAt', () => {
  it('adds the duration to the start instant', () => {
    expect(computeExpiresAt({ value: 2, unit: 'hours' }, '2026-03-01T00:00:00.000Z')).toBe(
      '2026-03-01T02:00:00.000Z',
    );
  });

  it('is null without a usable expiry', () => {
    expect(computeExpiresAt(null, '2026-03-01T00:00:00.000Z')).toBeNull();
  });
});

describe('isExpired', () => {
  it('is true at or after the deadline', () => {
    expect(isExpired('2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')).toBe(true);
    expect(isExpired('2026-03-01T00:00:00.000Z', '2026-03-01T01:00:00.000Z')).toBe(true);
    expect(isExpired('2026-03-01T00:00:00.000Z', '2026-02-28T23:59:59.000Z')).toBe(false);
  });

  it('never expires an absent/unparsable instant', () => {
    expect(isExpired(null, new Date())).toBe(false);
    expect(isExpired('not-a-date', new Date())).toBe(false);
  });
});

describe('normalizeMountExpiry', () => {
  it('round-trips a clean value', () => {
    expect(normalizeMountExpiry({ value: 3, unit: 'days' })).toEqual({ value: 3, unit: 'days' });
  });

  it('returns null for anything malformed', () => {
    expect(normalizeMountExpiry(undefined)).toBeNull();
    expect(normalizeMountExpiry({ value: 'x', unit: 'days' })).toBeNull();
    expect(normalizeMountExpiry({ value: 3, unit: 'months' })).toBeNull();
  });
});

describe('normalizeMountSession — lifetime fields', () => {
  it('defaults to no expiry and no persist', () => {
    const { session } = normalizeMountSession(
      { workspaceId: 'w1', mountpoint: '/mnt/x' },
      { id: 'm1', baseDir: '/base', caps: capsMirror },
    );
    expect(session.expiresAfter).toBeNull();
    expect(session.expiresAt).toBeNull();
    expect(session.persistAcrossRestarts).toBe(false);
  });

  it('carries a valid expiry and the persist flag', () => {
    const { session } = normalizeMountSession(
      { workspaceId: 'w1', mountpoint: '/mnt/x', expiresAfter: { value: 30, unit: 'minutes' }, persistAcrossRestarts: true },
      { id: 'm1', baseDir: '/base', caps: capsMirror },
    );
    expect(session.expiresAfter).toEqual({ value: 30, unit: 'minutes' });
    expect(session.persistAcrossRestarts).toBe(true);
    // `expiresAt` is only computed when the session actually mounts.
    expect(session.expiresAt).toBeNull();
  });
});

describe('normalizePersistedMountSession', () => {
  it('backfills the fields added after Phase 3', () => {
    // A record written before the lifetime feature: no expiry/persist keys.
    const old = {
      id: 'm1',
      workspaceId: 'w1',
      remoteFolderId: null,
      remoteFolderPath: '/',
      mountpoint: '/mnt/x',
      mode: 'read-only',
      delivery: 'mirror',
      state: 'stopped',
      cacheDir: '/base/cache',
      journalPath: '/base/cache.journal.jsonl',
      volumeName: 'Nexus',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      error: null,
    } as never;
    const out = normalizePersistedMountSession(old);
    expect(out.expiresAfter).toBeNull();
    expect(out.expiresAt).toBeNull();
    expect(out.persistAcrossRestarts).toBe(false);
  });
});
