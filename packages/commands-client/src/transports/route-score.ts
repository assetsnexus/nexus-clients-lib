/**
 * Shared route score: (1 - loss) * 1000 / max(rtt + 2 * jitter, 1) * kindWeight
 * Must stay identical to Rust RouteScorer::score.
 */
export function scoreRoute(opts: {
  rttMs: number;
  jitterMs: number;
  lossRatio: number;
  kindWeight: number;
  failed?: boolean;
}): number {
  if (opts.failed) return 0;
  const loss = Math.min(1, Math.max(0, opts.lossRatio));
  const rtt = Number.isFinite(opts.rttMs) ? opts.rttMs : 0;
  const jitter = Number.isFinite(opts.jitterMs) ? opts.jitterMs : 0;
  const weight = Number.isFinite(opts.kindWeight) ? opts.kindWeight : 1;
  const denom = Math.max(rtt + 2 * jitter, 1);
  return (1 - loss) * (1000 / denom) * weight;
}

export type RouteKind =
  | 'p2p_direct'
  | 'intranet'
  | 'registry_relay'
  | 'turn_relay'
  | 'federation_relay'
  | string;

/** Default kind weights aligned with Rust RouteType priority_weight. */
export function defaultKindWeight(kind: RouteKind): number {
  switch ((kind || '').toLowerCase()) {
    case 'p2p_direct':
    case 'intranet':
      return 1.0;
    case 'registry_relay':
      return 0.8;
    case 'turn_relay':
      return 0.5;
    case 'federation_relay':
      return 0.3;
    default:
      return 0.5;
  }
}
