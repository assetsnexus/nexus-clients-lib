import { describe, expect, it, vi } from 'vitest';
import { createClientConfigStore, mergeConfig, type ClientConfigStorage } from './store.js';

type Config = {
  features: { modelPicker: boolean; voice: boolean; calls: boolean };
  model: string;
  tags: string[];
};

const DEFAULTS: Config = {
  features: { modelPicker: true, voice: true, calls: true },
  model: 'default-model',
  tags: ['a', 'b'],
};

function memory(): ClientConfigStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('mergeConfig', () => {
  it('deep-merges objects and replaces arrays', () => {
    const merged = mergeConfig(DEFAULTS, { features: { voice: false }, tags: ['c'] });
    expect(merged.features).toEqual({ modelPicker: true, voice: false, calls: true });
    expect(merged.tags).toEqual(['c']);
  });

  it('ignores undefined values', () => {
    expect(mergeConfig(DEFAULTS, { model: undefined }).model).toBe('default-model');
  });
});

describe('createClientConfigStore', () => {
  it('returns the defaults before anything is set', () => {
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage: memory() });
    expect(store.get()).toEqual(DEFAULTS);
    expect(store.overrides()).toEqual({});
  });

  it('merges a patch and persists only the overrides', async () => {
    const storage = memory();
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage });
    store.set({ features: { voice: false } });
    expect(store.get().features.voice).toBe(false);
    expect(store.get().features.modelPicker).toBe(true);
    const raw = JSON.parse(storage.map.get('k') as string);
    expect(raw.overrides).toEqual({ features: { voice: false } });
  });

  it('hydrates overrides from storage', async () => {
    const storage = memory();
    storage.map.set('k', JSON.stringify({ v: 1, overrides: { model: 'mine' } }));
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage });
    await store.hydrate();
    expect(store.get().model).toBe('mine');
  });

  it('resets one key, then everything', () => {
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage: memory() });
    store.set({ model: 'mine', tags: ['x'] });
    store.reset('model');
    expect(store.get().model).toBe('default-model');
    expect(store.get().tags).toEqual(['x']);
    store.reset();
    expect(store.get()).toEqual(DEFAULTS);
  });

  it('notifies subscribers and isolates a throwing one', () => {
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage: memory() });
    const seen: string[] = [];
    store.subscribe(() => {
      throw new Error('boom');
    });
    const off = store.subscribe((config) => seen.push(config.model));
    store.set({ model: 'one' });
    off();
    store.set({ model: 'two' });
    expect(seen).toEqual(['one']);
  });

  it('drops a payload from an older version unless a migration handles it', async () => {
    const storage = memory();
    storage.map.set('k', JSON.stringify({ v: 1, overrides: { model: 'old' } }));
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', version: 2, storage });
    await store.hydrate();
    expect(store.get().model).toBe('default-model');
  });

  it('migrates an older payload when a migration is given', async () => {
    const storage = memory();
    storage.map.set('k', JSON.stringify({ v: 1, overrides: { model: 'old' } }));
    const migrate = vi.fn(() => ({ model: 'migrated' }));
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', version: 2, storage, migrate });
    await store.hydrate();
    expect(migrate).toHaveBeenCalledWith({ model: 'old' }, 1);
    expect(store.get().model).toBe('migrated');
  });

  it('exports and imports a snapshot', () => {
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage: memory() });
    store.set({ model: 'mine' });
    const snapshot = store.export();
    expect(snapshot).toEqual({ version: 1, overrides: { model: 'mine' } });

    const other = createClientConfigStore({ defaults: DEFAULTS, key: 'k2', storage: memory() });
    other.import(snapshot);
    expect(other.get().model).toBe('mine');
    other.import({ v: 99, overrides: { model: 'nope' } });
    expect(other.get().model).toBe('mine');
  });

  it('survives a storage that throws', async () => {
    const storage: ClientConfigStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    const store = createClientConfigStore({ defaults: DEFAULTS, key: 'k', storage });
    expect(await store.hydrate()).toEqual(DEFAULTS);
    expect(store.set({ model: 'mine' }).model).toBe('mine');
  });
});
