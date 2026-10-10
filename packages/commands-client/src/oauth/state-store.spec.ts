import { describe, expect, it } from 'vitest';
import { NEXUS_OAUTH_STATE_TTL_MS, takeOAuthState, writeOAuthState } from './state-store.js';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('oauth state store', () => {
  it('accepts the stored state once and then forgets it', () => {
    const storage = memoryStorage();
    writeOAuthState(storage, 'state', 'issued', 1_000);
    expect(takeOAuthState(storage, 'state', 'issued', 1_000)).toBe(true);
    expect(takeOAuthState(storage, 'state', 'issued', 1_000)).toBe(false);
  });

  it('rejects a different or expired state', () => {
    const storage = memoryStorage();
    writeOAuthState(storage, 'state', 'issued', 1_000);
    expect(takeOAuthState(storage, 'state', 'other', 1_000)).toBe(false);
    writeOAuthState(storage, 'state', 'issued', 1_000);
    expect(takeOAuthState(storage, 'state', 'issued', 1_000 + NEXUS_OAUTH_STATE_TTL_MS)).toBe(false);
  });

  it('still accepts a legacy raw state string', () => {
    const storage = memoryStorage();
    storage.setItem('state', 'issued');
    expect(takeOAuthState(storage, 'state', 'issued', 1_000)).toBe(true);
  });
});
