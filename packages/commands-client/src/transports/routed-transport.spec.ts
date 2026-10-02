import { afterEach, describe, expect, it } from 'vitest';
import type { RegionRoutes } from '../regions/region-routes.js';
import { RoutedTransport } from './routed-transport.js';
import type { RouteMonitorClock } from './route-monitor.js';

const routes = (list: RegionRoutes['routes']): RegionRoutes => ({
  slug: 'eu-west',
  routes: list,
});

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('RoutedTransport', () => {
  const open: RoutedTransport[] = [];

  afterEach(() => {
    for (const transport of open) transport.stop();
    open.length = 0;
  });

  function track(transport: RoutedTransport): RoutedTransport {
    open.push(transport);
    return transport;
  }

  it('prefers the lower priority route', async () => {
    const calls: string[] = [];
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://alt.example', priority: 5, kind: 'alternative' },
          { url: 'https://primary.example', priority: 1, kind: 'primary' },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls.push(url);
          return jsonResponse(200, { ok: true });
        },
      }),
    );

    const res = await transport.request({ method: 'GET', path: '/command/anx.user.profile.get', headers: {} });
    expect(res.status).toBe(200);
    expect(calls).toEqual(['https://primary.example/command/anx.user.profile.get']);
    expect(transport.getPrimaryOrigin()).toBe('https://primary.example');
  });

  it('retries a lone route on the next request after a transient failure', async () => {
    let calls = 0;
    const transport = track(
      new RoutedTransport({
        routes: routes([{ url: 'https://only.example', priority: 1, kind: 'primary' }]),
        probeIntervalMs: 60_000,
        fetchImpl: async (input) => {
          if (String(input).endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls += 1;
          if (calls === 1) return jsonResponse(503, { error: 'unavailable' });
          return jsonResponse(200, { ok: true });
        },
      }),
    );

    const first = await transport.request({ method: 'GET', path: '/v1', headers: {} });
    expect(first.status).toBe(503);
    const second = await transport.request({ method: 'GET', path: '/v1', headers: {} });
    expect(second.status).toBe(200);
  });

  it('fails over a GET on HTTP 503', async () => {
    const calls: string[] = [];
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1, kind: 'primary' },
          { url: 'https://alt.example', priority: 2, kind: 'alternative' },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls.push(url);
          if (url.startsWith('https://primary.example')) return jsonResponse(503, { error: 'unavailable' });
          return jsonResponse(200, { ok: true });
        },
      }),
    );

    const res = await transport.request({ method: 'GET', path: '/v1', headers: {} });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual({ ok: true });
    expect(calls[0]).toBe('https://primary.example/v1');
    expect(calls[1]).toBe('https://alt.example/v1');
    expect(transport.getPrimaryOrigin()).toBe('https://alt.example');
  });

  it('fails over a connection error', async () => {
    const calls: string[] = [];
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1 },
          { url: 'https://alt.example', priority: 2 },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls.push(url);
          if (url.startsWith('https://primary.example')) {
            throw codedError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:443');
          }
          return jsonResponse(200, { ok: true });
        },
      }),
    );

    const res = await transport.request({ method: 'GET', path: '/v1', headers: {} });
    expect(res.status).toBe(200);
    expect(calls).toEqual(['https://primary.example/v1', 'https://alt.example/v1']);
  });

  it('does not replay a write without an idempotency key', async () => {
    const calls: string[] = [];
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1 },
          { url: 'https://alt.example', priority: 2 },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls.push(url);
          if (url.startsWith('https://primary.example')) {
            throw codedError('ECONNRESET', 'socket hang up');
          }
          return jsonResponse(200, { ok: true });
        },
      }),
    );

    await expect(
      transport.request({ method: 'POST', path: '/command/anx.wallet.transfer', headers: {}, body: '{}' }),
    ).rejects.toThrow(/socket hang up/);
    expect(calls).toEqual(['https://primary.example/command/anx.wallet.transfer']);

    const idempotentCalls: string[] = [];
    const idempotentTransport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1 },
          { url: 'https://alt.example', priority: 2 },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          idempotentCalls.push(url);
          if (url.startsWith('https://primary.example')) {
            throw codedError('ECONNRESET', 'socket hang up');
          }
          return jsonResponse(200, { ok: true });
        },
      }),
    );
    const idempotent = await idempotentTransport.request({
      method: 'POST',
      path: '/command/anx.wallet.transfer',
      headers: { 'Idempotency-Key': 'idem_1' },
      body: '{}',
    });
    expect(idempotent.status).toBe(200);
    expect(idempotentCalls).toEqual([
      'https://primary.example/command/anx.wallet.transfer',
      'https://alt.example/command/anx.wallet.transfer',
    ]);
  });

  it('does not fail over on 4xx', async () => {
    const calls: string[] = [];
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1 },
          { url: 'https://alt.example', priority: 2 },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls.push(url);
          return jsonResponse(404, { responseCode: 404, errorObjects: [{ code: 'NOT_FOUND' }] });
        },
      }),
    );

    const res = await transport.request({ method: 'GET', path: '/missing', headers: {} });
    expect(res.status).toBe(404);
    expect(calls).toEqual(['https://primary.example/missing']);
  });

  it('adopts suggestedPeers from a 307 REGION_REDIRECT once, then succeeds', async () => {
    const calls: string[] = [];
    let peerRedirects = false;
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1, kind: 'primary' },
          { url: 'https://alt.example', priority: 2, kind: 'alternative' },
        ]),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) return jsonResponse(200, { status: 'ok' });
          calls.push(url);
          if (url.startsWith('https://primary.example') || url.startsWith('https://alt.example')) {
            return jsonResponse(200, {
              responseCode: 307,
              errorObjects: [{ code: 'REGION_REDIRECT', message: 'wrong region' }],
              responseObject: {
                redirect: true,
                targetRegion: 'eu-west',
                suggestedPeers: [
                  { region: 'eu-west', endpoints: ['https://peer.example', { url: 'https://peer.example' }] },
                ],
              },
            });
          }
          if (url.startsWith('https://peer.example')) {
            if (peerRedirects) {
              return jsonResponse(200, {
                responseCode: 307,
                errorObjects: [{ code: 'REGION_REDIRECT', message: 'again' }],
                responseObject: {
                  suggestedPeers: [{ region: 'other', endpoints: ['https://other.example'] }],
                },
              });
            }
            return jsonResponse(200, { ok: true });
          }
          return jsonResponse(500, { error: 'unexpected' });
        },
      }),
    );

    const first = await transport.request({ method: 'POST', path: '/command/anx.user.profile.get', headers: {} });
    expect(first.status).toBe(200);
    expect(JSON.parse(first.text)).toEqual({ ok: true });
    expect(calls).toContain('https://peer.example/command/anx.user.profile.get');
    expect(calls.some((url) => url.startsWith('https://other.example'))).toBe(false);
    expect(transport.getPrimaryOrigin()).toBe('https://peer.example');

    calls.length = 0;
    peerRedirects = true;
    const second = await transport.request({ method: 'GET', path: '/again', headers: {} });
    expect(second.status).toBe(200);
    expect(JSON.parse(second.text).responseCode).toBe(307);
    expect(calls).toEqual(['https://peer.example/again']);
  });

  it('returns to the primary after probes succeed', async () => {
    const timers: Array<{ id: number; at: number; fn: () => void }> = [];
    let now = 0;
    let nextId = 1;
    const clock: RouteMonitorClock = {
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = nextId++;
        timers.push({ id, at: now + ms, fn });
        return id;
      },
      clearTimeout: (id) => {
        const index = timers.findIndex((timer) => timer.id === id);
        if (index >= 0) timers.splice(index, 1);
      },
    };

    async function advance(ms: number) {
      const target = now + ms;
      while (true) {
        const due = timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at);
        if (due.length === 0) {
          now = target;
          break;
        }
        const next = due[0];
        now = next.at;
        const index = timers.findIndex((timer) => timer.id === next.id);
        if (index >= 0) timers.splice(index, 1);
        next.fn();
        for (let i = 0; i < 30; i += 1) await Promise.resolve();
      }
    }

    let primaryDown = true;
    const transport = track(
      new RoutedTransport({
        routes: routes([
          { url: 'https://primary.example', priority: 1, kind: 'primary' },
          { url: 'https://alt.example', priority: 2, kind: 'alternative' },
        ]),
        probeIntervalMs: 30_000,
        clock,
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith('/health')) {
            if (url.startsWith('https://primary.example') && primaryDown) return jsonResponse(503, { status: 'down' });
            return jsonResponse(200, { status: 'ok' });
          }
          if (url.startsWith('https://primary.example') && primaryDown) return jsonResponse(503, { error: 'down' });
          return jsonResponse(200, { ok: true });
        },
      }),
    );

    const res = await transport.request({ method: 'GET', path: '/v1', headers: {} });
    expect(res.status).toBe(200);
    expect(transport.getPrimaryOrigin()).toBe('https://alt.example');

    primaryDown = false;
    await advance(0);
    expect(transport.getPrimaryOrigin()).toBe('https://primary.example');
    const active = transport.snapshots().find((row) => row.active);
    expect(active?.url).toBe('https://primary.example');
    expect(active?.probeOk).toBe(true);
    expect(active?.failed).toBe(false);
  });
});
