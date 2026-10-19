import { describe, expect, it } from 'vitest';
import { contextDonutModel } from './context-donut.js';

describe('context donut', () => {
  it('builds portal-style slices and a clamped percent', () => {
    const model = contextDonutModel({
      tokensUsed: 10,
      maxContextTokens: 100,
      snapshot: {
        dispatchedTokens: 40,
        dispatchBudgetTokens: 80,
        categories: [
          { category: 'chat_history', tokens: 30, pct: 75 },
          { category: 'tools', tokens: 10, pct: 25 },
          { category: 'empty', tokens: 0, pct: 0 },
        ],
      },
    });
    expect(model.pct).toBe(50);
    expect(model.slices.map((slice) => slice.label)).toEqual(['Chat history', 'Tool schemas']);
    expect(model.slices[0]?.offset).toBe(25);
    expect(model.slices[1]?.offset).toBe(-50);
  });

  it('shows an empty ring when usage is unknown', () => {
    expect(contextDonutModel({}).pct).toBeNull();
    expect(contextDonutModel({}).tokenLabel).toBe('—');
  });

  it('labels the active-plan slice', () => {
    const model = contextDonutModel({
      snapshot: {
        dispatchedTokens: 10,
        dispatchBudgetTokens: 100,
        categories: [{ category: 'plan', tokens: 10, pct: 100 }],
      },
    });
    expect(model.slices.map((slice) => slice.label)).toEqual(['Active plan']);
  });
});
