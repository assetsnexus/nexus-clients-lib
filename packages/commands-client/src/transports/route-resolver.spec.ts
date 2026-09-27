import { describe, expect, it } from 'vitest';
import { defaultKindWeight } from './route-score.js';
import {
  mdnsEndpointToLanCandidate,
  mergeLanMdnsCandidates,
  normalizeCandidate,
  pickBestRoute,
  resolveRoutes,
} from './route-resolver.js';

describe('defaultKindWeight new offline kinds', () => {
  it('orders LAN > wifi_direct > peer_relay > p2p > registry > turn > ble', () => {
    expect(defaultKindWeight('lan_mdns')).toBe(1.2);
    expect(defaultKindWeight('intranet')).toBe(1.2);
    expect(defaultKindWeight('wifi_direct')).toBe(1.1);
    expect(defaultKindWeight('cluster_peer_relay')).toBe(1.05);
    expect(defaultKindWeight('p2p_direct')).toBe(1.0);
    expect(defaultKindWeight('registry_relay')).toBe(0.8);
    expect(defaultKindWeight('turn_relay')).toBe(0.5);
    expect(defaultKindWeight('ble')).toBe(0.15);

    expect(defaultKindWeight('lan_mdns')).toBeGreaterThan(defaultKindWeight('wifi_direct'));
    expect(defaultKindWeight('wifi_direct')).toBeGreaterThan(
      defaultKindWeight('cluster_peer_relay'),
    );
    expect(defaultKindWeight('cluster_peer_relay')).toBeGreaterThan(
      defaultKindWeight('p2p_direct'),
    );
    expect(defaultKindWeight('ble')).toBeLessThan(defaultKindWeight('turn_relay'));
  });
});

describe('resolveRoutes', () => {
  it('prefers lan_mdns over cluster_peer_relay at equal QoS', () => {
    const ranked = resolveRoutes([
      { id: 'relay', kind: 'cluster_peer_relay', rttMs: 20, jitterMs: 2 },
      { id: 'lan', kind: 'lan_mdns', rttMs: 20, jitterMs: 2 },
      { id: 'stun', kind: 'p2p_direct', rttMs: 20, jitterMs: 2 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['lan', 'relay', 'stun']);
  });

  it('drops ble when resolving for media', () => {
    const ranked = resolveRoutes(
      [
        { id: 'ble', kind: 'ble', rttMs: 5 },
        { id: 'lan', kind: 'lan_mdns', rttMs: 20 },
      ],
      { forMedia: true },
    );
    expect(ranked.map((r) => r.id)).toEqual(['lan']);
  });

  it('normalizeCandidate maps asset-node camelCase shape', () => {
    const c = normalizeCandidate({
      routeId: 'cluster_peer_relay_0',
      routeType: 'cluster_peer_relay',
      priorityWeight: 1.05,
      url: 'https://10.0.0.2:8443',
      host: 'peer-a',
      port: 8443,
    });
    expect(c?.id).toBe('cluster_peer_relay_0');
    expect(c?.kind).toBe('cluster_peer_relay');
    expect(c?.kindWeight).toBe(1.05);
    expect(pickBestRoute([c!])?.kind).toBe('cluster_peer_relay');
  });
});

describe('mdnsEndpointToLanCandidate', () => {
  it('builds a lan_mdns candidate from a discovered endpoint', () => {
    const c = mdnsEndpointToLanCandidate({
      host: '192.168.1.20',
      port: 8443,
      assetId: 'asset-lan-1',
    });
    expect(c.kind).toBe('lan_mdns');
    expect(c.url).toBe('https://192.168.1.20:8443');
    expect(c.host).toBe('asset-lan-1');
    expect(c.kindWeight).toBe(defaultKindWeight('lan_mdns'));
    const ranked = resolveRoutes([
      { id: 'turn', kind: 'turn_relay', rttMs: 5 },
      c,
    ]);
    expect(ranked[0].id).toBe(c.id);
  });

  it('mergeLanMdnsCandidates dedupes by id/url', () => {
    const merged = mergeLanMdnsCandidates(
      [{ id: 'lan_mdns:192.168.1.20:8443', kind: 'lan_mdns', url: 'https://192.168.1.20:8443' }],
      [{ host: '192.168.1.20', port: 8443 }, { host: '192.168.1.21', port: 8443 }],
    );
    expect(merged).toHaveLength(2);
    expect(merged[1].url).toBe('https://192.168.1.21:8443');
  });
});
