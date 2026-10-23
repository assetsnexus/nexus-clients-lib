import { describe, expect, it } from 'vitest';
import {
  decideConflict,
  joinRemotePath,
  reconcile,
  resolveFolderIdByPath,
  sameContent,
  toRemoteEntries,
  type LocalEntry,
  type RemoteEntry,
} from './sync-engine.js';

const local = (relPath: string, over: Partial<LocalEntry> = {}): LocalEntry => ({
  relPath,
  kind: 'file',
  size: 10,
  mtimeMs: 1000,
  ...over,
});

const remote = (relPath: string, over: Partial<RemoteEntry> = {}): RemoteEntry => ({
  relPath,
  kind: 'file',
  size: 10,
  mtimeMs: 1000,
  fileId: 'f-' + relPath,
  revision: 1,
  ...over,
});

describe('sameContent', () => {
  it('prefers hashes', () => {
    expect(sameContent(local('a', { hash: 'x' }), remote('a', { hash: 'x', size: 99 }))).toBe(true);
    expect(sameContent(local('a', { hash: 'x' }), remote('a', { hash: 'y' }))).toBe(false);
  });

  it('falls back to size + mtime tolerance', () => {
    expect(sameContent(local('a'), remote('a', { mtimeMs: 1400 }))).toBe(true);
    expect(sameContent(local('a'), remote('a', { mtimeMs: 3000 }))).toBe(false);
    expect(sameContent(local('a'), remote('a', { size: 11 }))).toBe(false);
  });
});

describe('reconcile — creates', () => {
  it('uploads local-only files in two-way', () => {
    const res = reconcile([local('a.txt')], [], { mode: 'two-way', conflictPolicy: 'newest-wins' });
    expect(res.actions).toEqual([{ kind: 'upload', relPath: 'a.txt', reason: 'file only local' }]);
    expect(res.summary.upload).toBe(1);
  });

  it('downloads remote-only files in two-way', () => {
    const res = reconcile([], [remote('b.txt')], { mode: 'two-way', conflictPolicy: 'newest-wins' });
    expect(res.actions[0]).toMatchObject({ kind: 'download', relPath: 'b.txt' });
  });

  it('ignores the non-source side in one-way modes', () => {
    const up = reconcile([local('a')], [remote('b')], { mode: 'upload-only', conflictPolicy: 'newest-wins' });
    expect(up.actions.map((a) => a.kind).sort()).toEqual(['skip', 'upload']);
    const down = reconcile([local('a')], [remote('b')], { mode: 'download-only', conflictPolicy: 'newest-wins' });
    expect(down.actions.map((a) => a.kind).sort()).toEqual(['download', 'skip']);
  });
});

describe('reconcile — dirs', () => {
  it('mkdirs the other side for dir-only entries', () => {
    const res = reconcile(
      [local('sub', { kind: 'dir', size: 0 })],
      [remote('other', { kind: 'dir', size: 0 })],
      { mode: 'two-way', conflictPolicy: 'newest-wins' },
    );
    expect(res.summary['mkdir-remote']).toBe(1);
    expect(res.summary['mkdir-local']).toBe(1);
  });

  it('skips dirs present on both sides', () => {
    const res = reconcile([local('sub', { kind: 'dir' })], [remote('sub', { kind: 'dir' })], {
      mode: 'two-way',
      conflictPolicy: 'newest-wins',
    });
    expect(res.summary.skip).toBe(1);
  });

  it('flags a file/dir kind mismatch as a conflict', () => {
    const res = reconcile([local('x', { kind: 'file' })], [remote('x', { kind: 'dir' })], {
      mode: 'two-way',
      conflictPolicy: 'newest-wins',
    });
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].reason).toMatch(/kind mismatch/);
  });
});

describe('reconcile — updates + conflicts', () => {
  it('skips unchanged files', () => {
    const res = reconcile([local('a', { hash: 'h' })], [remote('a', { hash: 'h' })], {
      mode: 'two-way',
      conflictPolicy: 'newest-wins',
    });
    expect(res.summary.skip).toBe(1);
  });

  it('newest-wins uploads when local is newer', () => {
    const res = reconcile([local('a', { mtimeMs: 5000, hash: 'l' })], [remote('a', { mtimeMs: 1000, hash: 'r' })], {
      mode: 'two-way',
      conflictPolicy: 'newest-wins',
    });
    expect(res.actions[0]).toMatchObject({ kind: 'upload', resolution: 'local' });
  });

  it('newest-wins downloads when remote is newer', () => {
    const res = reconcile([local('a', { mtimeMs: 1000, hash: 'l' })], [remote('a', { mtimeMs: 5000, hash: 'r' })], {
      mode: 'two-way',
      conflictPolicy: 'newest-wins',
    });
    expect(res.actions[0]).toMatchObject({ kind: 'download', resolution: 'remote' });
  });

  it('same mtime + different content is a real conflict', () => {
    const res = reconcile([local('a', { hash: 'l' })], [remote('a', { hash: 'r' })], {
      mode: 'two-way',
      conflictPolicy: 'newest-wins',
    });
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].resolution).toBe('none');
  });

  it('honours local-wins / remote-wins / keep-both', () => {
    const l = local('a', { hash: 'l', mtimeMs: 1 });
    const r = remote('a', { hash: 'r', mtimeMs: 2 });
    expect(reconcile([l], [r], { mode: 'two-way', conflictPolicy: 'local-wins' }).actions[0]).toMatchObject({ kind: 'upload', resolution: 'local' });
    expect(reconcile([l], [r], { mode: 'two-way', conflictPolicy: 'remote-wins' }).actions[0]).toMatchObject({ kind: 'download', resolution: 'remote' });
    const keepBoth = reconcile([l], [r], { mode: 'two-way', conflictPolicy: 'keep-both' });
    expect(keepBoth.conflicts[0]).toMatchObject({ kind: 'conflict', resolution: 'both' });
  });
});

describe('decideConflict', () => {
  it('makes the one-way source side authoritative', () => {
    const l = local('a', { hash: 'l' });
    const r = remote('a', { hash: 'r' });
    expect(decideConflict(l, r, { mode: 'upload-only', conflictPolicy: 'newest-wins' }).kind).toBe('upload');
    expect(decideConflict(l, r, { mode: 'download-only', conflictPolicy: 'newest-wins' }).kind).toBe('download');
  });
});

describe('path helpers', () => {
  it('joins a sub-dir base with a relative path', () => {
    expect(joinRemotePath('/', 'a.txt')).toBe('/a.txt');
    expect(joinRemotePath('/Projects/Clients', 'a.txt')).toBe('/Projects/Clients/a.txt');
    expect(joinRemotePath('/Projects/Clients/', '/a.txt')).toBe('/Projects/Clients/a.txt');
  });

  it('maps region rows to remote entries with a rel base', () => {
    const rows = [{ id: '1', name: 'a.txt', sizeBytes: 5, createdAt: '2026-01-02T00:00:00.000Z', revisionNo: 3 }];
    const [e] = toRemoteEntries(rows, 'sub');
    expect(e).toMatchObject({ relPath: 'sub/a.txt', size: 5, fileId: '1', revision: 3, kind: 'file' });
    expect(e.mtimeMs).toBe(Date.parse('2026-01-02T00:00:00.000Z'));
  });
});

describe('resolveFolderIdByPath', () => {
  const folders = [
    { id: 'p', name: 'Projects', parentFolderId: null },
    { id: 'c', name: 'Clients', parentFolderId: 'p' },
    { id: 'o', name: 'Other', parentFolderId: null },
  ];

  it('resolves the root, a nested path, and reports the missing tail', () => {
    expect(resolveFolderIdByPath('/', folders)).toEqual({ folderId: null });
    expect(resolveFolderIdByPath('/Projects/Clients', folders)).toEqual({ folderId: 'c' });
    expect(resolveFolderIdByPath('/Projects/Missing/Deep', folders)).toEqual({ missingAt: ['Missing', 'Deep'] });
  });
});

describe('multiple syncs stay independent', () => {
  it('reconciles two bindings to different sub-dirs without cross-talk', () => {
    const a = reconcile([local('a.txt')], [], { mode: 'two-way', conflictPolicy: 'newest-wins' });
    const b = reconcile([], [remote('b.txt')], { mode: 'two-way', conflictPolicy: 'newest-wins' });
    expect(a.actions[0]).toMatchObject({ kind: 'upload', relPath: 'a.txt' });
    expect(b.actions[0]).toMatchObject({ kind: 'download', relPath: 'b.txt' });
  });
});
