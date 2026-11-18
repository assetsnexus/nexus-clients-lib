/**
 * Client-side configuration: code defaults + user overrides.
 *
 * A Nexus app usually ships sensible defaults in code and lets the user adjust
 * a few of them. That is the same shape for chat (which panels, which model
 * picker, voice on/off) and for the app's own settings (which perspective,
 * which units), so it lives here once instead of in every app.
 *
 * The rules:
 *
 * - `defaults` come from code and are never persisted.
 * - `overrides` are what the user changed, persisted under one key.
 * - `get()` is `defaults` deep-merged with `overrides`, so a new default in a
 *   later release reaches a user who never touched that key.
 * - `version` guards a schema change: a stored payload from an older version is
 *   dropped (or migrated) rather than merged into a shape it no longer matches.
 * - Arrays replace, they do not merge: a user who removes an item means it.
 *
 * The store is synchronous to read (it hydrates from storage once) and async to
 * hydrate, so a browser `localStorage` and a native async store both work.
 */

/** A partial that also allows partial nested objects. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

export type ClientConfigStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export type ClientConfigLogger = {
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

export type ClientConfigStoreOptions<T extends Record<string, unknown>> = {
  /** Code defaults. Never persisted. */
  defaults: T;
  /** Storage key. Namespace it per app, e.g. `myapp.settings`. */
  key: string;
  /** Bump when the shape changes incompatibly. Default 1. */
  version?: number;
  /** Defaults to `localStorage` when available, otherwise memory. */
  storage?: ClientConfigStorage;
  /** Optional: turn an older stored payload into overrides for the new shape. */
  migrate?: (stored: unknown, fromVersion: number) => DeepPartial<T> | null;
  logger?: ClientConfigLogger;
};

export type ClientConfigSnapshot<T extends Record<string, unknown>> = {
  version: number;
  overrides: Partial<T>;
};

export type ClientConfigStore<T extends Record<string, unknown>> = {
  /** Defaults deep-merged with the current overrides. */
  get(): T;
  /** Only what the user changed. */
  overrides(): Partial<T>;
  /** Deep-merges a patch into the overrides, persists, and notifies. */
  set(patch: DeepPartial<T>): T;
  /** Resets one key to its default, or every key when called with no argument. */
  reset(key?: keyof T): T;
  /** Replaces the overrides wholesale (e.g. "restore defaults"). */
  replace(overrides: DeepPartial<T>): T;
  /** Subscribe to changes. Returns an unsubscribe. */
  subscribe(listener: (config: T) => void): () => void;
  /** Loads from storage. Call once at startup; `get()` works before it too. */
  hydrate(): Promise<T>;
  /** A portable snapshot, for export/import or a server-side profile. */
  export(): ClientConfigSnapshot<T>;
  /** Applies a snapshot, ignoring one from a different version. */
  import(payload: unknown): T;
};

type StoredEnvelope = {
  v: number;
  overrides: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Deep merge: objects merge, arrays and primitives replace. */
export function mergeConfig<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(value) && isPlainObject(current) ? mergeConfig(current, value) : value;
  }
  return out as T;
}

function memoryStorage(): ClientConfigStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function defaultStorage(): ClientConfigStorage {
  const candidate = (globalThis as { localStorage?: ClientConfigStorage }).localStorage;
  if (candidate && typeof candidate.getItem === 'function') return candidate;
  return memoryStorage();
}

export function createClientConfigStore<T extends Record<string, unknown>>(
  opts: ClientConfigStoreOptions<T>,
): ClientConfigStore<T> {
  const version = opts.version ?? 1;
  const storage = opts.storage || defaultStorage();
  const listeners = new Set<(config: T) => void>();
  let overrides: Partial<T> = {};
  let hydrated = false;

  function current(): T {
    return mergeConfig(opts.defaults, overrides as Record<string, unknown>);
  }

  function notify(): void {
    const config = current();
    for (const listener of [...listeners]) {
      try {
        listener(config);
      } catch (err) {
        opts.logger?.warn?.('client_config_listener_failed', {
          detail: err instanceof Error ? err.message : 'listener failed',
        });
      }
    }
  }

  async function persist(): Promise<void> {
    const envelope: StoredEnvelope = { v: version, overrides: overrides as Record<string, unknown> };
    try {
      await storage.setItem(opts.key, JSON.stringify(envelope));
    } catch (err) {
      // A full or blocked storage must not break the app: the in-memory value
      // stays correct for this session.
      opts.logger?.warn?.('client_config_write_failed', {
        detail: err instanceof Error ? err.message : 'write failed',
      });
    }
  }

  function applyOverrides(next: Record<string, unknown>): T {
    overrides = next as Partial<T>;
    void persist();
    notify();
    return current();
  }

  return {
    get: current,
    overrides: () => ({ ...overrides }),

    set(patch) {
      return applyOverrides(
        mergeConfig(overrides as Record<string, unknown>, patch as Record<string, unknown>),
      );
    },

    reset(key) {
      if (key === undefined) return applyOverrides({});
      const next = { ...(overrides as Record<string, unknown>) };
      delete next[key as string];
      return applyOverrides(next as Partial<T>);
    },

    replace(next) {
      return applyOverrides({ ...(next as Record<string, unknown>) });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async hydrate() {
      if (hydrated) return current();
      hydrated = true;
      let raw: string | null;
      try {
        raw = await storage.getItem(opts.key);
      } catch {
        return current();
      }
      if (!raw) return current();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return current();
      }
      const envelope = parsed as Partial<StoredEnvelope>;
      if (!isPlainObject(envelope) || !isPlainObject(envelope.overrides)) return current();
      if (envelope.v !== version) {
        const migrated = opts.migrate?.(envelope.overrides, Number(envelope.v) || 0);
        if (!migrated) {
          opts.logger?.warn?.('client_config_version_dropped', {
            stored: envelope.v,
            current: version,
          });
          return current();
        }
        overrides = migrated as Partial<T>;
        void persist();
        notify();
        return current();
      }
      overrides = envelope.overrides as Partial<T>;
      notify();
      return current();
    },

    export() {
      return { version, overrides: { ...overrides } };
    },

    import(payload) {
      if (!isPlainObject(payload)) return current();
      const envelope = payload as Partial<StoredEnvelope> & { version?: number };
      const payloadVersion = envelope.v ?? envelope.version;
      if (payloadVersion !== version || !isPlainObject(envelope.overrides)) return current();
      return applyOverrides(envelope.overrides);
    },
  };
}
