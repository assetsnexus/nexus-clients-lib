import { describe, expect, it } from 'vitest'
import {
  bestLatencyByModel,
  metricsRouteKind,
  pickPrimaryRoute,
  routeModel,
  routeQosState,
} from './route-scoring.js'

describe('route scoring', () => {
  it('classifies p2p vs region proxy', () => {
    expect(routeModel({ id: 'p2p_direct_rest_0', routeType: 'p2p_direct' })).toBe('p2p')
    expect(routeModel({ id: 'registry_relay_1', routeType: 'registry_relay' })).toBe('region_proxy')
  })

  it('rejects non-socket routes', () => {
    expect(metricsRouteKind({ id: 'x', url: 'stun:stun.l.google.com:19302' })).toBeNull()
    expect(metricsRouteKind({ id: 'x', url: 'https://localhost:80' })).toBeNull()
    expect(metricsRouteKind({ id: 'x', url: 'https://edge:28680', routeType: 'p2p_direct' })).toBe('p2p')
    expect(metricsRouteKind({ id: 'x', url: 'https://reg:30400', routeType: 'registry_relay' })).toBe(
      'region_proxy',
    )
  })

  it('reports qos state', () => {
    expect(routeQosState({ id: 'a', reachable: false })).toBe('offline')
    expect(routeQosState({ id: 'a', isCurrent: true })).toBe('active')
    expect(routeQosState({ id: 'a', latency: 200 })).toBe('degraded')
    expect(routeQosState({ id: 'a', latency: 20 })).toBe('standby')
  })

  it('picks the best latency per model', () => {
    const best = bestLatencyByModel([
      { id: 'p1', routeType: 'p2p_direct', latency: 40 },
      { id: 'p2', routeType: 'p2p_direct', latency: 20 },
      { id: 'r1', routeType: 'registry_relay', latency: 80 },
    ])
    expect(best).toEqual({ p2p: 20, region_proxy: 80 })
  })

  it('prefers p2p over region proxy, then latency', () => {
    const primary = pickPrimaryRoute([
      { id: 'r1', url: 'https://reg:30400', routeType: 'registry_relay', latency: 10 },
      { id: 'p1', url: 'https://edge:28680', routeType: 'p2p_direct', latency: 40 },
    ])
    expect(primary?.id).toBe('p1')
  })

  it('returns null when nothing is usable', () => {
    expect(pickPrimaryRoute([{ id: 'x', url: 'stun:x:1' }])).toBeNull()
  })
})
