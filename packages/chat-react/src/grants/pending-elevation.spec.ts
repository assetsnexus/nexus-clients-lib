import { describe, expect, it } from 'vitest';
import {
  elevationRespondSucceeded,
  pendingElevationPrompt,
  pendingElevationPrompts,
  removeElevationPrompt,
  unwrapElevationList,
  upsertElevationPrompt,
} from './pending-elevation.js';

describe('pendingElevationPrompts', () => {
  it('returns every pending row and skips active grants', () => {
    const prompts = pendingElevationPrompts([
      { elevationId: 'a1', status: 'active', packs: ['crm'] },
      {
        elevationId: 'p1',
        status: 'pending',
        packs: ['tasks'],
        commandNames: ['anx.tasks.create'],
        reason: 'Need tasks',
      },
      {
        elevationId: 'p2',
        status: 'pending',
        packs: ['workspace'],
        commandNames: ['anx.workspace.list'],
      },
    ]);
    expect(prompts.map((p) => p.elevationId)).toEqual(['p1', 'p2']);
  });

  it('exposes the first pending row via pendingElevationPrompt', () => {
    expect(
      pendingElevationPrompt([
        { elevationId: 'a1', status: 'active' },
        { elevationId: 'p1', status: 'pending', packs: ['tasks'] },
      ])?.elevationId,
    ).toBe('p1');
    expect(pendingElevationPrompt([])).toBeNull();
  });
});

describe('upsertElevationPrompt / removeElevationPrompt', () => {
  it('upserts by elevationId and removes decided rows', () => {
    const first = upsertElevationPrompt([], {
      elevationId: 'e1',
      pack: 'workspace',
      command: 'anx.workspace.list',
    });
    const second = upsertElevationPrompt(first, {
      elevationId: 'e1',
      pack: 'workspace',
      reason: 'updated',
    });
    expect(second).toHaveLength(1);
    expect(second[0].reason).toBe('updated');
    expect(removeElevationPrompt(second, 'e1')).toEqual([]);
  });
});

describe('unwrapElevationList / elevationRespondSucceeded', () => {
  it('reads responseObject and ignores failed sends', () => {
    expect(unwrapElevationList({ responseObject: [{ elevationId: 'e1', status: 'pending' }] })).toHaveLength(
      1,
    );
    expect(unwrapElevationList({ ok: false, responseObject: [{ elevationId: 'e1' }] })).toEqual([]);
  });

  it('treats BFF and commands-client success shapes as ok', () => {
    expect(elevationRespondSucceeded({ ok: true, data: {} })).toBe(true);
    expect(elevationRespondSucceeded({ responseCode: 200 })).toBe(true);
    expect(elevationRespondSucceeded({ response: { responseCode: 200 } })).toBe(true);
    expect(elevationRespondSucceeded({ ok: false, responseCode: 403 })).toBe(false);
  });
});
