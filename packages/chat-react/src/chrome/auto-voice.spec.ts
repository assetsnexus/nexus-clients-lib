import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAutoVoice, spokenTurnKey, writeAutoVoice } from './auto-voice.js';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

describe('auto voice preference', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults off and round-trips the toggle', () => {
    expect(readAutoVoice()).toBe(false);
    writeAutoVoice(true);
    expect(readAutoVoice()).toBe(true);
    writeAutoVoice(false);
    expect(readAutoVoice()).toBe(false);
  });

  it('accepts the legacy true/false spellings', () => {
    localStorage.setItem('anx-chat-auto-voice', 'true');
    expect(readAutoVoice()).toBe(true);
    localStorage.setItem('anx-chat-auto-voice', '0');
    expect(readAutoVoice()).toBe(false);
  });

  it('falls back when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readAutoVoice(true)).toBe(true);
    expect(() => writeAutoVoice(true)).not.toThrow();
  });

  it('keys a spoken turn by id, then by a text slice', () => {
    expect(spokenTurnKey({ id: 't1', role: 'assistant', text: 'hello' })).toBe('t1');
    const fallback = spokenTurnKey({ id: '', role: 'assistant', text: 'hello there' });
    expect(fallback).toBe('assistant:hello there');
    expect(spokenTurnKey({ role: null, text: null })).toBe('assistant:');
  });
});
