/** Context usage percent from tokensUsed / maxContextTokens (clamped 0–100). */
export function contextUsagePercent(
  tokensUsed: number | null | undefined,
  maxContextTokens: number | null | undefined,
): number | null {
  const used = typeof tokensUsed === 'number' && Number.isFinite(tokensUsed) ? tokensUsed : null;
  const max =
    typeof maxContextTokens === 'number' && Number.isFinite(maxContextTokens) && maxContextTokens > 0
      ? maxContextTokens
      : null;
  if (used == null || max == null) return null;
  return Math.min(100, Math.max(0, Math.round((used / max) * 100)));
}

export function formatContextTokensLabel(
  tokensUsed: number | null | undefined,
  maxContextTokens: number | null | undefined,
): string {
  const used = typeof tokensUsed === 'number' && Number.isFinite(tokensUsed) ? tokensUsed : null;
  const max =
    typeof maxContextTokens === 'number' && Number.isFinite(maxContextTokens) && maxContextTokens > 0
      ? maxContextTokens
      : null;
  if (used == null && max == null) return '—';
  if (max == null) return used != null && used > 0 ? `${used} tok` : '—';
  return `${used ?? 0} / ${max} tok`;
}
