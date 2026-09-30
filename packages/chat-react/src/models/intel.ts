/** Artificial Analysis intelligence display — same bands as oc-controller llmModelMeta. */

export function formatIntelScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

export function intelTone(
  value: number | null | undefined,
): 'low' | 'mid' | 'high' | 'top' | 'unknown' {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 15) return 'low';
  if (value < 30) return 'mid';
  if (value < 45) return 'high';
  return 'top';
}

export function priceTone(
  value: number | null | undefined,
): 'free' | 'low' | 'mid' | 'high' | 'unknown' {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value <= 0) return 'free';
  if (value < 0.5) return 'low';
  if (value < 5) return 'mid';
  return 'high';
}

export function formatUsdPerM(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return 'free';
  if (value < 0.01) return `$${value.toFixed(3)}`;
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 10) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(1)}`;
}

export function formatCreditsPerM(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  if (value >= 10) return `${Math.round(value)} cr/M`;
  if (value >= 1) return `${value.toFixed(1)} cr/M`;
  return `${value.toFixed(2)} cr/M`;
}
