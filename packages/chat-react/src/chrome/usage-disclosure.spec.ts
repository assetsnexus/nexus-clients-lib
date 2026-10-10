import { describe, expect, it } from 'vitest';
import { ADVANCED_USAGE_OPEN_BY_DEFAULT } from './usage-disclosure.js';

describe('usage disclosure', () => {
  it('keeps context, cost, and model selection collapsed', () => {
    expect(ADVANCED_USAGE_OPEN_BY_DEFAULT).toBe(false);
  });
});
