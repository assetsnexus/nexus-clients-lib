import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './version.js';

describe('isNewerVersion', () => {
  it('accepts a strictly newer safe integer', () => {
    expect(isNewerVersion(0, 1)).toBe(true);
    expect(isNewerVersion(4, 4)).toBe(false);
    expect(isNewerVersion(5, 4)).toBe(false);
  });

  it('ignores non-integers so a bad payload cannot rewind roles', () => {
    expect(isNewerVersion(1, Number.NaN)).toBe(false);
    expect(isNewerVersion(1, 1.5)).toBe(false);
    expect(isNewerVersion(-1, 2)).toBe(false);
  });
});
