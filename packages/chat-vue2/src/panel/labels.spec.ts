import { formatCreditCents, formatMoneyMinor, spendLabelForCurrency } from './labels';

describe('chat-vue2 money labels', () => {
  it('formats credits with cr suffix', () => {
    expect(formatCreditCents(123)).toBe('1.23 cr');
  });

  it('formats USD and EUR with currency symbols', () => {
    expect(formatMoneyMinor(123, 'USD')).toBe('$1.23');
    expect(formatMoneyMinor(123, 'EUR')).toBe('€1.23');
    expect(formatMoneyMinor(150, 'USD')).toBe('$1.50');
  });

  it('keeps ISO code for other currencies', () => {
    expect(formatMoneyMinor(100, 'JPY')).toBe('100 JPY');
    expect(formatMoneyMinor(150, 'GBP')).toBe('1.50 GBP');
  });

  it('shows extra precision when standard digits would fake-zero', () => {
    // 0.12 minor cents → $0.0012 when treated as fractional minor input path
    expect(formatMoneyMinor(0.12, 'USD')).toBe('$0.0012');
    expect(formatMoneyMinor(0.12, 'EUR')).toBe('€0.0012');
  });

  it('falls back to credits when currency missing', () => {
    expect(formatMoneyMinor(50, null)).toBe('0.50 cr');
    expect(formatMoneyMinor(50, '')).toBe('0.50 cr');
  });

  it('uses Cost label when currency present', () => {
    expect(spendLabelForCurrency('EUR')).toBe('Cost');
    expect(spendLabelForCurrency('USD')).toBe('Cost');
    expect(spendLabelForCurrency(null)).toBe('Credits');
  });
});
