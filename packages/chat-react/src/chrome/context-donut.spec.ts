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

  it('renders a label (never raw snake_case) for every backend category', () => {
    // Contract list mirrored from inference
    // `context-category.constants.ts` CONTEXT_CATEGORY_IDS.
    const BACKEND_CONTEXT_CATEGORY_IDS = [
      'identity',
      'instructions',
      'app_guidance',
      'world_knowledge',
      'plan',
      'page_context',
      'page_tools',
      'workspace',
      'entity_index',
      'objectives',
      'tools',
      'tool_concepts',
      'lifecycle',
      'chat_history',
      'tool_results',
      'compaction_summary',
    ];
    const model = contextDonutModel({
      snapshot: {
        dispatchedTokens: 160,
        dispatchBudgetTokens: 1000,
        categories: BACKEND_CONTEXT_CATEGORY_IDS.map((category) => ({
          category,
          tokens: 10,
          pct: 6,
        })),
      },
    });
    expect(model.measured).toBe(true);
    expect(model.slices).toHaveLength(BACKEND_CONTEXT_CATEGORY_IDS.length);
    for (const slice of model.slices) {
      expect(slice.label).not.toMatch(/_/);
      expect(slice.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('marks a snapshot with no categories as not measured (distinct from all-zero)', () => {
    const unmeasured = contextDonutModel({
      tokensUsed: 500,
      maxContextTokens: 1000,
      snapshot: { dispatchedTokens: 500, maxContextTokens: 1000, measured: false },
    });
    expect(unmeasured.measured).toBe(false);
    expect(unmeasured.slices).toHaveLength(0);
    // A real (but empty) breakdown is measured === true.
    const measuredZero = contextDonutModel({
      snapshot: { dispatchedTokens: 0, dispatchBudgetTokens: 1000, categories: [] },
    });
    expect(measuredZero.measured).toBe(true);
  });

  it('humanizes an unknown category id instead of exposing snake_case', () => {
    const model = contextDonutModel({
      snapshot: {
        dispatchedTokens: 10,
        dispatchBudgetTokens: 100,
        categories: [{ category: 'brand_new_lane', tokens: 10, pct: 100 }],
      },
    });
    expect(model.slices[0]?.label).toBe('Brand New Lane');
  });
});
