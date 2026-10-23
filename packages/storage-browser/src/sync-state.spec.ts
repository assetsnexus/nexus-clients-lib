import { describe, expect, it } from 'vitest';
import {
  emptySyncState,
  planDeletions,
  pruneSyncState,
  recordSyncState,
  syncedRevisionOf,
  type SyncState,
} from './sync-state.js';
import type { LocalEntry, RemoteEntry } from './sync-engine.js';

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

function stateWith(rows: Array<Partial<SyncState['entries'][string]> & { relPath: string }>): SyncState {
  const entries: SyncState['entries'] = {};
  for (const r of rows) {
    entries[r.relPath] = {
      relPath: r.relPath,
      hash: r.hash ?? null,
      size: r.size ?? 10,
      localMtimeMs: r.localMtimeMs ?? 1000,
      remoteMtimeMs: r.remoteMtimeMs ?? 1000,
      remoteRevision: r.remoteRevision ?? 1,
      remoteFileId: r.remoteFileId ?? 'f-' + r.relPath,
      syncedAt: '2026-03-01T00:00:00.000Z',
    };
  }
  return { bindingId: 'b1', entries };
}

describe('recordSyncState', () => {
  it('records paths present on both sides with the remote revision', () => {
    const next = recordSyncState(emptySyncState('b1'), {
      local: [local('a.txt', { mtimeMs: 5000 })],
      remote: [remote('a.txt', { revision: 7 })],
      deleted: [],
      now: () => new Date('2026-03-02T00:00:00.000Z'),
    });
    expect(next.entries['a.txt']).toMatchObject({
      remoteRevision: 7,
      remoteFileId: 'f-a.txt',
      localMtimeMs: 5000,
      syncedAt: '2026-03-02T00:00:00.000Z',
    });
  });

  it('records a remote-only file (created from the remote) but never a local-only file', () => {
    const next = recordSyncState(emptySyncState('b1'), {
      local: [local('only-local.txt')],
      remote: [remote('only-remote.txt', { revision: 3 })],
      deleted: [],
    });
    expect(next.entries['only-remote.txt'].remoteRevision).toBe(3);
    expect(next.entries['only-local.txt']).toBeUndefined();
  });

  it('drops entries that were deleted this pass', () => {
    const before = stateWith([{ relPath: 'gone.txt' }]);
    const next = recordSyncState(before, { local: [], remote: [], deleted: ['gone.txt'] });
    expect(next.entries['gone.txt']).toBeUndefined();
  });
});

describe('syncedRevisionOf', () => {
  it('reads back the recorded revision', () => {
    expect(syncedRevisionOf(stateWith([{ relPath: 'a', remoteRevision: 4 }]), 'a')).toBe(4);
    expect(syncedRevisionOf(stateWith([]), 'a')).toBeNull();
  });
});

describe('planDeletions', () => {
  const twoWay = { mode: 'two-way' as const, conflictPolicy: 'newest-wins' as const };

  it('never deletes without proof (no state row)', () => {
    const plan = planDeletions(emptySyncState('b1'), [], [remote('remote-only.txt')], twoWay);
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.deleteRemote).toEqual([]);
  });

  it('deletes remotely when a synced path was removed locally and remote is unchanged', () => {
    const state = stateWith([{ relPath: 'a.txt', remoteRevision: 2 }]);
    const plan = planDeletions(state, [], [remote('a.txt', { revision: 2 })], twoWay);
    expect(plan.deleteRemote).toHaveLength(1);
    expect(plan.deleteRemote[0]).toMatchObject({ kind: 'delete-remote', relPath: 'a.txt', fileId: 'f-a.txt' });
  });

  it('refuses to delete remotely when the remote revision advanced (conflict)', () => {
    const state = stateWith([{ relPath: 'a.txt', remoteRevision: 2 }]);
    const plan = planDeletions(state, [], [remote('a.txt', { revision: 5 })], twoWay);
    expect(plan.deleteRemote).toEqual([]);
    expect(plan.conflicts[0].reason).toMatch(/remote changed/);
  });

  it('deletes locally when a synced path was removed remotely and local is unchanged', () => {
    const state = stateWith([{ relPath: 'a.txt', localMtimeMs: 1000 }]);
    const plan = planDeletions(state, [local('a.txt', { mtimeMs: 1000 })], [], twoWay);
    expect(plan.deleteLocal).toHaveLength(1);
  });

  it('refuses to delete locally when the local file was edited (conflict)', () => {
    const state = stateWith([{ relPath: 'a.txt', localMtimeMs: 1000 }]);
    const plan = planDeletions(state, [local('a.txt', { mtimeMs: 9000 })], [], twoWay);
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.conflicts[0].reason).toMatch(/edited locally/);
  });

  it('never deletes in one-way modes', () => {
    const state = stateWith([{ relPath: 'a.txt' }]);
    expect(planDeletions(state, [], [remote('a.txt')], { mode: 'upload-only', conflictPolicy: 'newest-wins' }).deleteRemote).toEqual([]);
    expect(planDeletions(state, [local('a.txt')], [], { mode: 'download-only', conflictPolicy: 'newest-wins' }).deleteLocal).toEqual([]);
  });

  it('ignores paths still present on both sides', () => {
    const state = stateWith([{ relPath: 'a.txt' }]);
    const plan = planDeletions(state, [local('a.txt')], [remote('a.txt')], twoWay);
    expect(plan).toEqual({ deleteLocal: [], deleteRemote: [], conflicts: [] });
  });
});

describe('pruneSyncState', () => {
  it('keeps only the listed paths', () => {
    const state = stateWith([{ relPath: 'a' }, { relPath: 'b' }]);
    const pruned = pruneSyncState(state, ['b']);
    expect(Object.keys(pruned.entries)).toEqual(['b']);
  });
});
