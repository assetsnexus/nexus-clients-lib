import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_TEXT_SCALE_MAX,
  CHAT_TEXT_SCALE_MIN,
  applyTextScaleToElement,
  clampTextScaleDelta,
  readTextScaleDelta,
  textScaleFontSize,
  textScaleMultiplier,
  writeTextScaleDelta,
} from './text-scale.js';

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

describe('chat text scale', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clamps the delta to the readable range', () => {
    expect(clampTextScaleDelta(99)).toBe(CHAT_TEXT_SCALE_MAX);
    expect(clampTextScaleDelta(-99)).toBe(CHAT_TEXT_SCALE_MIN);
    expect(clampTextScaleDelta(Number.NaN)).toBe(0);
    expect(clampTextScaleDelta(1.6)).toBe(2);
  });

  it('keeps a zero delta at exactly 1x and returns no font override', () => {
    expect(textScaleMultiplier(0)).toBe(1);
    expect(textScaleFontSize(0)).toBeNull();
    expect(textScaleFontSize(2)).toBe('calc(14px * 1.25)');
    expect(textScaleFontSize(-2)).toBe('calc(14px * 0.75)');
  });

  it('round-trips the persisted preference', () => {
    expect(readTextScaleDelta()).toBe(0);
    writeTextScaleDelta(3);
    expect(readTextScaleDelta()).toBe(3);
    // Storage is clamped on read too, so a hand-edited value cannot blow up the UI.
    localStorage.setItem('anx-chat-text-scale-delta', '42');
    expect(readTextScaleDelta()).toBe(CHAT_TEXT_SCALE_MAX);
  });

  it('applies and clears the CSS variable on the root', () => {
    // Stub the element rather than reaching for `document`, so this spec keeps
    // running on the fast `node` environment (only `*.spec.tsx` gets jsdom).
    const props = new Map<string, string>();
    const el = {
      style: {
        setProperty: (key: string, value: string) => void props.set(key, value),
        removeProperty: (key: string) => void props.delete(key),
        getPropertyValue: (key: string) => props.get(key) ?? '',
      },
    } as unknown as HTMLElement;

    applyTextScaleToElement(el, 2);
    expect(props.get('--nx-chat-font-size')).toBe('calc(14px * 1.25)');
    applyTextScaleToElement(el, 0);
    expect(props.get('--nx-chat-font-size')).toBeUndefined();
    // A missing element is a no-op, never a throw.
    expect(() => applyTextScaleToElement(null, 1)).not.toThrow();
  });
});
