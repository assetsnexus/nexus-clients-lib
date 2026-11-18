import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  catalogHash,
  grantedCommandsFromList,
  missingPermissions,
} from './seed-catalog.js';

describe('canonicalJson', () => {
  it('sorts object keys and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [2, 1] })).toBe('{"a":[2,1],"b":1}');
  });

  it('drops undefined values so a missing field is not a change', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('is stable across key insertion order', () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });
});

describe('catalogHash', () => {
  it('is a sha256 tag and is stable for the same payload', async () => {
    const payload = { agent: { name: 'A' }, rules: [{ key: 'r', content: 'x' }] };
    const first = await catalogHash(payload);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await catalogHash(payload)).toBe(first);
  });

  it('changes when the payload changes', async () => {
    expect(await catalogHash({ a: 1 })).not.toBe(await catalogHash({ a: 2 }));
  });

  it('does not change when only the key order changes', async () => {
    expect(await catalogHash({ a: 1, b: 2 })).toBe(await catalogHash({ b: 2, a: 1 }));
  });
});

describe('missingPermissions', () => {
  it('returns the declared commands the grant does not include', () => {
    expect(missingPermissions(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('is empty when everything is granted', () => {
    expect(missingPermissions(['a'], ['a', 'b'])).toEqual([]);
  });
});

describe('grantedCommandsFromList', () => {
  it('reads grantedCommands from the first grant', () => {
    expect(grantedCommandsFromList({ items: [{ grantedCommands: ['a', 'b'] }] })).toEqual(['a', 'b']);
  });

  it('returns null when the shape is not what we expect', () => {
    expect(grantedCommandsFromList({ items: [] })).toBeNull();
    expect(grantedCommandsFromList({})).toBeNull();
    expect(grantedCommandsFromList(null)).toBeNull();
  });
});
