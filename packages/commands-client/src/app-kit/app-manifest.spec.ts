import { describe, expect, it } from 'vitest';
import {
  blocksApproval,
  createAppManifest,
  diffAppManifest,
  disabledNativeCommands,
  exposedTools,
  isToolExposed,
  pendingRequirements,
  requirementAction,
} from './app-manifest.js';

const seed = {
  manifest: {
    version: '1.0.0',
    capabilities: [{ slug: 'generic:gardening', title: 'Gardening' }],
    signals: [{ slug: 'generic:watering_due', title: 'Watering due', channels: ['notification' as const] }],
    toolExposure: { mode: 'none' as const },
  },
  requirements: {
    requires: [
      { target: { kind: 'capability' as const, slug: 'generic:docs' }, required: false, purpose: 'docs' },
    ],
  },
};

describe('createAppManifest', () => {
  it('hashes deterministically regardless of key order', async () => {
    const a = await createAppManifest(seed);
    const b = await createAppManifest({
      requirements: seed.requirements,
      manifest: seed.manifest,
    });
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes the hash when the manifest changes', async () => {
    const a = await createAppManifest(seed);
    const b = await createAppManifest({ ...seed, manifest: { ...seed.manifest, version: '1.0.1' } });
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('diffAppManifest', () => {
  it('treats an absent previous seed as changed', async () => {
    const diff = await diffAppManifest(null, seed);
    expect(diff.changed).toBe(true);
    expect(diff.changedKeys).toEqual(['manifest', 'requirements']);
  });

  it('is a no-op when the hash is unchanged', async () => {
    const first = await createAppManifest(seed);
    const diff = await diffAppManifest(seed, seed, first.hash);
    expect(diff.changed).toBe(false);
    expect(diff.changedKeys).toEqual([]);
  });

  it('reports the changed top-level key', async () => {
    const first = await createAppManifest(seed);
    const next = { ...seed, manifest: { ...seed.manifest, version: '2.0.0' } };
    const diff = await diffAppManifest(seed, next, first.hash);
    expect(diff.changed).toBe(true);
    expect(diff.changedKeys).toEqual(['manifest']);
  });
});

describe('requirement helpers', () => {
  const payload = {
    requirements: [
      { target: { kind: 'capability' as const, slug: 'generic:docs' }, required: true, purpose: 'docs', status: 'missing' as const, action: { kind: 'install_app' as const } },
      { target: { kind: 'app' as const, clientId: 'p' }, required: false, purpose: 'x', status: 'satisfied' as const },
    ],
    warnings: [],
  };

  it('blocks approval only for a required non-satisfied row', () => {
    expect(blocksApproval(payload)).toBe(true);
    expect(blocksApproval({ requirements: [payload.requirements[1]], warnings: [] })).toBe(false);
    expect(blocksApproval(null)).toBe(false);
  });

  it('lists pending rows and their action', () => {
    expect(pendingRequirements(payload)).toHaveLength(1);
    expect(requirementAction(payload.requirements[0])).toEqual({ kind: 'install_app' });
    expect(requirementAction(payload.requirements[1])).toBeNull();
  });
});

describe('tool exposure', () => {
  it('mirrors the region rule', () => {
    expect(isToolExposed({ exposure: { mode: 'none' }, toolName: 'anx.docs.list' })).toBe(false);
    expect(isToolExposed({ exposure: { mode: 'all' }, toolName: 'anx.docs.list' })).toBe(true);
    expect(
      isToolExposed({ exposure: { mode: 'allowlist', patterns: ['anx.docs.'] }, toolName: 'anx.docs.list' }),
    ).toBe(true);
    expect(
      isToolExposed({ exposure: { mode: 'blocklist', patterns: ['anx.docs.'] }, toolName: 'anx.docs.list' }),
    ).toBe(false);
    expect(
      isToolExposed({
        exposure: { mode: 'none', partnerClientIds: ['partner'] },
        consumerClientId: 'partner',
        toolName: 'anx.docs.list',
      }),
    ).toBe(true);
  });

  it('filters a tool list and lists disabled native commands', () => {
    expect(
      exposedTools({ exposure: { mode: 'allowlist', patterns: ['anx.docs.'] }, toolNames: ['anx.docs.list', 'anx.crm.list'] }),
    ).toEqual(['anx.docs.list']);
    expect(
      disabledNativeCommands({ disable: [{ pattern: 'anx.tasks.', reason: 'r' }], customize: [{ pattern: 'anx.crm.lead.update', reason: 'r' }] }),
    ).toEqual(['anx.tasks.']);
  });
});
