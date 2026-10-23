import { describe, expect, it } from 'vitest';
import {
  addSyncBinding,
  isExcluded,
  normalizeRemotePath,
  normalizeSyncBinding,
  removeSyncBinding,
  updateSyncBinding,
  validateSyncBindings,
  type SyncBinding,
} from './sync-model.js';

const now = () => new Date('2026-01-01T00:00:00.000Z');

function make(over: Partial<Parameters<typeof normalizeSyncBinding>[0]> = {}, id = 's1'): SyncBinding {
  return normalizeSyncBinding(
    {
      name: 'Docs',
      workspaceId: 'w1',
      remoteFolderId: 'f1',
      remoteFolderPath: '/Projects/Clients',
      localDir: '/home/me/nexus/clients',
      ...over,
    },
    { id, now },
  ).binding;
}

describe('normalizeSyncBinding', () => {
  it('defaults mode/conflict/interval and stamps timestamps', () => {
    const b = make();
    expect(b.mode).toBe('two-way');
    expect(b.conflictPolicy).toBe('newest-wins');
    expect(b.intervalSeconds).toBe(300);
    expect(b.enabled).toBe(true);
    expect(b.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('normalizes the remote path to a leading slash', () => {
    expect(make({ remoteFolderPath: 'Projects//Clients/' }).remoteFolderPath).toBe('/Projects/Clients');
    expect(normalizeRemotePath('')).toBe('/');
    expect(normalizeRemotePath('/')).toBe('/');
  });

  it('warns and clamps bad intervals and unknown policies', () => {
    const { binding, warnings } = normalizeSyncBinding(
      {
        name: 'x',
        workspaceId: 'w',
        localDir: '/l',
        mode: 'sideways' as never,
        conflictPolicy: 'coin-flip' as never,
        intervalSeconds: 5,
      },
      { id: 's', now },
    );
    expect(binding.mode).toBe('two-way');
    expect(binding.conflictPolicy).toBe('newest-wins');
    expect(binding.intervalSeconds).toBe(15);
    expect(warnings.length).toBe(3);
  });

  it('allows a manual-only sync (interval 0)', () => {
    expect(make({ intervalSeconds: 0 }).intervalSeconds).toBe(0);
  });
});

describe('updateSyncBinding', () => {
  it('preserves createdAt and applies the patch', () => {
    const b = make();
    const { binding } = updateSyncBinding(b, { name: 'Renamed', mode: 'upload-only' }, () => new Date('2026-02-02T00:00:00.000Z'));
    expect(binding.name).toBe('Renamed');
    expect(binding.mode).toBe('upload-only');
    expect(binding.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(binding.updatedAt).toBe('2026-02-02T00:00:00.000Z');
  });
});

describe('validateSyncBindings', () => {
  it('accepts distinct syncs', () => {
    const bindings = [
      make({ name: 'A', localDir: '/a', remoteFolderId: 'f1' }, 's1'),
      make({ name: 'B', localDir: '/b', remoteFolderId: 'f2' }, 's2'),
    ];
    expect(validateSyncBindings(bindings)).toEqual([]);
  });

  it('rejects a duplicate name, local dir and remote sub-dir', () => {
    const bindings = [
      make({ name: 'Same', localDir: '/same', remoteFolderId: 'f1' }, 's1'),
      make({ name: 'same', localDir: '/same', remoteFolderId: 'f1' }, 's2'),
    ];
    const issues = validateSyncBindings(bindings);
    expect(issues.filter((i) => i.bindingId === 's2').map((i) => i.field).sort()).toEqual([
      'localDir',
      'name',
      'remoteDir',
    ]);
  });

  it('flags missing + non-absolute fields', () => {
    const bad: SyncBinding = { ...make(), workspaceId: '', localDir: 'relative/dir' };
    const issues = validateSyncBindings([bad]);
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(['workspaceId', 'localDir']));
  });

  it('treats windows paths case-insensitively', () => {
    const bindings = [
      make({ name: 'A', localDir: 'C:\\Nexus\\Docs' }, 's1'),
      make({ name: 'B', localDir: 'c:\\nexus\\docs' }, 's2'),
    ];
    const issues = validateSyncBindings(bindings).filter((i) => i.field === 'localDir');
    expect(issues).toHaveLength(2);
  });
});

describe('registry helpers', () => {
  it('adds, finds and removes bindings', () => {
    const first = addSyncBinding([], { name: 'A', workspaceId: 'w', localDir: '/a', remoteFolderId: 'fa' }, { id: 's1', now });
    expect(first.bindings).toHaveLength(1);
    const second = addSyncBinding(first.bindings, { name: 'B', workspaceId: 'w', localDir: '/b', remoteFolderId: 'fb' }, { id: 's2', now });
    expect(second.issues).toEqual([]);
    expect(removeSyncBinding(second.bindings, 's1').map((b) => b.id)).toEqual(['s2']);
  });

  it('flags a second writing sync of the same sub-dir', () => {
    const first = addSyncBinding([], { name: 'A', workspaceId: 'w', localDir: '/a', remoteFolderId: 'shared' }, { id: 's1', now });
    const second = addSyncBinding(first.bindings, { name: 'B', workspaceId: 'w', localDir: '/b', remoteFolderId: 'shared' }, { id: 's2', now });
    expect(second.issues.some((i) => i.field === 'remoteDir')).toBe(true);
  });

  it('surfaces issues when adding a colliding sync', () => {
    const first = addSyncBinding([], { name: 'A', workspaceId: 'w', localDir: '/same' }, { id: 's1', now });
    const second = addSyncBinding(first.bindings, { name: 'A', workspaceId: 'w', localDir: '/same' }, { id: 's2', now });
    expect(second.issues.length).toBeGreaterThan(0);
  });
});

describe('isExcluded', () => {
  it('matches bare names on any segment and path prefixes', () => {
    expect(isExcluded('node_modules/pkg/index.js', ['node_modules'])).toBe(true);
    expect(isExcluded('a/node_modules/x', ['node_modules'])).toBe(true);
    expect(isExcluded('build/out.txt', ['build/out.txt'])).toBe(true);
    expect(isExcluded('build/other.txt', ['build/out.txt'])).toBe(false);
    expect(isExcluded('src/app.ts', ['node_modules', '.git'])).toBe(false);
  });

  it('handles empty pattern lists and separators', () => {
    expect(isExcluded('a/b', [])).toBe(false);
    expect(isExcluded('', ['x'])).toBe(false);
    expect(isExcluded('a\\b\\c', ['b'])).toBe(true);
  });
});
