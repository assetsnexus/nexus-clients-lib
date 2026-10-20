import { describe, expect, it } from 'vitest';
import { parsePrecedentUse, PRECEDENT_NOT_APPLICABLE_DEFAULT_REASON } from './precedent.js';

describe('parsePrecedentUse', () => {
  it('reads a decision_usage record_use result', () => {
    const use = parsePrecedentUse({
      ok: true,
      outcome: 'recorded',
      decisionId: 'dec_1',
      usageId: 'use_1',
      usageCount: 3,
    });
    expect(use).toMatchObject({ decisionId: 'dec_1', usageId: 'use_1' });
  });

  it('reads a nested decision shape from find-similar / precedent_found', () => {
    const use = parsePrecedentUse({
      ok: true,
      outcome: 'precedent_found',
      decision: { decisionId: 'dec_2', summary: 'Refunds under 50 are auto-approved', scope: 'org' },
      chosenLabels: ['Approve'],
    });
    expect(use).toMatchObject({
      decisionId: 'dec_2',
      summary: 'Refunds under 50 are auto-approved',
      scope: 'org',
      chosenLabels: ['Approve'],
    });
  });

  it('reads a nested match shape with object labels', () => {
    const use = parsePrecedentUse({ match: { id: 'dec_3', chosenLabels: [{ label: 'Deny' }] } });
    expect(use).toMatchObject({ decisionId: 'dec_3', chosenLabels: ['Deny'] });
  });

  it('returns null when no decision id is present', () => {
    expect(parsePrecedentUse({ ok: true, outcome: 'recorded' })).toBeNull();
    expect(parsePrecedentUse(null)).toBeNull();
    expect(parsePrecedentUse('nope')).toBeNull();
  });

  it('exposes a safe default reason for the not-applicable action', () => {
    expect(PRECEDENT_NOT_APPLICABLE_DEFAULT_REASON.length).toBeGreaterThan(0);
  });
});
