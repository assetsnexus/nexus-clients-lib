import { describe, expect, it } from 'vitest';
import { formatMicroUsd, formatMoneyMinor, spendLabelForCurrency } from './labels';

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

describe('formatMicroUsd', () => {
  it('renders sub-cent (millicent) precision instead of €0.00', () => {
    // 400 micro-USD = $0.0004 → ≈ €0.0004; would round to 0 whole cents.
    expect(formatMicroUsd(400, 'EUR')).toBe('€0.0004');
    expect(formatMicroUsd(400, 'USD')).toBe('$0.0004');
  });

  it('keeps standard cent precision once the amount is at least half a cent', () => {
    // 42_000 micro-USD = $0.042 → displays as €0.04 (normal money rounding).
    expect(formatMicroUsd(42_000, 'EUR')).toBe('€0.04');
  });

  it('applies an FX rate and falls back to credits without a currency', () => {
    // 400 micro-USD at 0.9 EUR/USD = €0.00036 → sub-cent branch (4 dp).
    expect(formatMicroUsd(400, 'EUR', 0.9)).toBe('€0.0004');
    expect(formatMicroUsd(50_000, null)).toBe('0.05 cr');
  });

  it('returns zero money for a null / non-positive amount', () => {
    expect(formatMicroUsd(null, 'EUR')).toBe('€0.00');
    expect(formatMicroUsd(0, 'EUR')).toBe('€0.00');
  });
});
