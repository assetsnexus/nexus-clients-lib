import { describe, expect, it } from 'vitest';
import { formatMoneyMinor, spendLabelForCurrency } from './labels';

describe('spendLabelForCurrency', () => {
  it('uses Cost when an ISO currency is present (BYOK)', () => {
    expect(spendLabelForCurrency('EUR')).toBe('Cost');
    expect(spendLabelForCurrency('usd')).toBe('Cost');
  });

  it('uses Credits when currency is missing', () => {
    expect(spendLabelForCurrency(null)).toBe('Credits');
    expect(spendLabelForCurrency('')).toBe('Credits');
  });

  it('accepts localized cost/credits labels', () => {
    expect(spendLabelForCurrency('EUR', { cost: 'Kosten', credits: 'Guthaben' })).toBe('Kosten');
    expect(spendLabelForCurrency(null, { cost: 'Kosten', credits: 'Guthaben' })).toBe('Guthaben');
  });
});

describe('formatMoneyMinor', () => {
  it('formats EUR/USD with symbols', () => {
    expect(formatMoneyMinor(1234, 'EUR')).toBe('€12.34');
    expect(formatMoneyMinor(50, 'USD')).toBe('$0.50');
  });

  it('falls back to credit chrome without currency', () => {
    expect(formatMoneyMinor(250, null)).toBe('2.50 cr');
  });
});
