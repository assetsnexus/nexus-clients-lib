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
  | 'lan_mdns'
  | 'wifi_direct'
  | 'cluster_peer_relay'
  | 'registry_relay'
  | 'turn_relay'
  | 'federation_relay'
  | 'ble'
  | string;

/**
 * Default kind weights aligned with Rust `RouteType::priority_weight`.
 * Order: LAN / intranet > Wi-Fi Direct > peer relay > STUN P2P > registry > TURN > BLE.
 */
export function defaultKindWeight(kind: RouteKind): number {
  switch ((kind || '').toLowerCase()) {
    case 'lan_mdns':
    case 'intranet':
      return 1.2;
    case 'wifi_direct':
      return 1.1;
    case 'cluster_peer_relay':
      return 1.05;
    case 'p2p_direct':
      return 1.0;
    case 'registry_relay':
      return 0.8;
    case 'turn_relay':
      return 0.5;
    case 'federation_relay':
      return 0.3;
    case 'ble':
      return 0.15;
    default:
      return 0.5;
  }
}
