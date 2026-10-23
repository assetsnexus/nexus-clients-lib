import { describe, expect, it } from 'vitest';
import {
  buildMountPlan,
  driverForPlatform,
  isSafeMountRelPath,
  makeJournalEntry,
  orderJournal,
  type JournalEntry,
} from './mount-plan.js';

describe('driverForPlatform', () => {
  it('picks the native driver per OS', () => {
    expect(driverForPlatform('linux')).toBe('fuse');
    expect(driverForPlatform('win32')).toBe('winfsp');
    expect(driverForPlatform('darwin')).toBe('macfuse');
    expect(driverForPlatform('aix' as NodeJS.Platform)).toBe('nfs');
  });
});

describe('buildMountPlan', () => {
  const base = {
    id: 'b1',
    workspaceId: 'w1',
    mountpoint: '/home/me/nexus/docs',
    cacheDir: '/home/me/.cache/nexus/docs',
    journalPath: '/home/me/.cache/nexus/docs.journal',
  };

  it('builds a plan with the platform driver', () => {
    const plan = buildMountPlan({ platform: 'linux', bindings: [base] });
    expect(plan.driver).toBe('fuse');
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0].mode).toBe('read-only');
    expect(plan.warnings).toEqual([]);
  });

  it('rejects a relative mountpoint', () => {
    const plan = buildMountPlan({ platform: 'linux', bindings: [{ ...base, mountpoint: 'docs' }] });
    expect(plan.bindings).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/absolute/);
  });

  it('rejects a duplicate mountpoint', () => {
    const plan = buildMountPlan({ platform: 'linux', bindings: [base, { ...base, id: 'b2' }] });
    expect(plan.bindings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/duplicate/);
  });

  it('downgrades read-write to read-only when the workspace is not writable', () => {
    const plan = buildMountPlan({
      platform: 'linux',
      bindings: [{ ...base, mode: 'read-write', workspaceWritable: false }],
    });
    expect(plan.bindings[0].mode).toBe('read-only');
    expect(plan.warnings[0]).toMatch(/not writable/);
  });

  it('keeps read-write when the workspace is writable', () => {
    const plan = buildMountPlan({
      platform: 'win32',
      bindings: [{ ...base, mountpoint: 'C:\\Nexus\\docs', mode: 'read-write', workspaceWritable: true }],
    });
    expect(plan.driver).toBe('winfsp');
    expect(plan.bindings[0].mode).toBe('read-write');
  });

  it('accepts a windows drive/UNC path', () => {
    const plan = buildMountPlan({
      platform: 'win32',
      bindings: [{ ...base, mountpoint: '\\\\server\\share\\docs' }],
    });
    expect(plan.bindings).toHaveLength(1);
  });
});

describe('isSafeMountRelPath', () => {
  it('accepts normal nested paths', () => {
    expect(isSafeMountRelPath('a/b/c.txt')).toBe(true);
    expect(isSafeMountRelPath('a\\b\\c.txt')).toBe(true);
  });

  it('rejects traversal, dot segments, empty and NUL', () => {
    expect(isSafeMountRelPath('../etc/passwd')).toBe(false);
    expect(isSafeMountRelPath('a/../../b')).toBe(false);
    expect(isSafeMountRelPath('./a')).toBe(false);
    expect(isSafeMountRelPath('')).toBe(false);
    expect(isSafeMountRelPath('a\0b')).toBe(false);
  });
});

describe('journal', () => {
  it('stamps enqueue time', () => {
    const entry = makeJournalEntry(
      { bindingId: 'b1', relPath: 'a.txt', op: 'write', baseRevision: 1 },
      () => new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(entry.enqueuedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('orders oldest first', () => {
    const entries: JournalEntry[] = [
      makeJournalEntry({ bindingId: 'b', relPath: '2', op: 'write', baseRevision: null }, () => new Date('2026-01-02T00:00:00.000Z')),
      makeJournalEntry({ bindingId: 'a', relPath: '1', op: 'write', baseRevision: null }, () => new Date('2026-01-01T00:00:00.000Z')),
    ];
    expect(orderJournal(entries).map((e) => e.relPath)).toEqual(['1', '2']);
  });
});
