import { afterEach, describe, expect, it, vi } from 'vitest';
import { NexusClient } from '../client.js';
import { sdkClientHeaderValue } from '../client-headers.js';
import { HealthPinger } from './health-pinger.js';
import type { AnxNodeHealthV1 } from './types.js';

const healthBody: AnxNodeHealthV1 = {
  status: 'degraded',
  nodeKind: 'region',
  serverVersion: '1.2.3',
  protocolVersion: 1,
  catalogFingerprint: 'fp-1',
  deprecations: {
    warning: true,
    nearestSunsetAt: '2027-01-01',
    commands: [
      {
        command: 'anx.old',
        commandVersion: 1,
        latestVersion: 2,
        usedByCaller: true,
        sunsetAt: '2027-01-01',
      },
    ],
  },
};

describe('HealthPinger', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings only after the idle gap and resets that gap on traffic', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const pinger = new HealthPinger({
      getBaseUrl: () => 'https://eu.example',
      idleIntervalMs: 1_000,
      fetchImpl: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify(healthBody), { status: 200 });
      },
    });
    pinger.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toEqual([]);
    pinger.touch();
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await pinger.settle();
    expect(calls).toEqual(['https://eu.example/health']);
    pinger.stop();
  });

  it('emits a deprecation once for the same catalog fingerprint and warning set', async () => {
    vi.useFakeTimers();
    const notices: string[] = [];
    const pinger = new HealthPinger({
      getBaseUrl: () => 'https://eu.example',
      idleIntervalMs: 10,
      onDeprecation: (notice) => notices.push(notice.signature),
      fetchImpl: async () => new Response(JSON.stringify(healthBody), { status: 200 }),
    });
    pinger.start();
    await vi.advanceTimersByTimeAsync(10);
    await pinger.settle();
    await vi.advanceTimersByTimeAsync(10);
    await pinger.settle();
    expect(notices).toHaveLength(1);
    pinger.stop();
  });

  it('parses Deprecation, Sunset, and Link once per command', () => {
    const notices: Array<{ command?: string; deprecation?: string }> = [];
    const pinger = new HealthPinger({
      getBaseUrl: () => 'https://eu.example',
      onDeprecation: (notice) => notices.push({ command: notice.command, deprecation: notice.deprecation }),
    });
    const headers = new Headers({
      Deprecation: '@1700000000',
      Sunset: 'Wed, 01 Jan 2027 00:00:00 GMT',
      Link: '<anx.wallet.transfer>; rel="successor-version"',
    });
    pinger.noteResponseHeaders(headers, 'anx.old');
    pinger.noteResponseHeaders(headers, 'anx.old');
    expect(notices).toEqual([
      {
        command: 'anx.old',
        deprecation: '@1700000000',
      },
    ]);
    pinger.stop();
  });

  it('backs off when the health request fails', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const pinger = new HealthPinger({
      getBaseUrl: () => 'https://eu.example',
      idleIntervalMs: 100,
      fetchImpl: async () => {
        calls += 1;
        throw new Error('connect ECONNREFUSED');
      },
    });
    pinger.start();
    await vi.advanceTimersByTimeAsync(100);
    await pinger.settle();
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await pinger.settle();
    expect(calls).toBe(2);
    pinger.stop();
  });
});

describe('NexusClient version headers', () => {
  it('sends X-Anx-Client and commandVersion, and skips an invalid X-Anx-App', async () => {
    let seen: { headers?: Headers; body?: string } = {};
    const client = new NexusClient({
      baseUrl: 'https://eu.example',
      app: { name: 'bad name', version: '1.0.0' },
      fetchImpl: async (_input, init) => {
        seen = {
          headers: new Headers(init?.headers),
          body: typeof init?.body === 'string' ? init.body : undefined,
        };
        return new Response(
          JSON.stringify({
            responseCode: 200,
            responseObject: { ok: true },
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const result = await client.send('anx.region.get', { slug: 'eu-west' }, { commandVersion: 1, isRead: true });
    expect(result.ok).toBe(true);
    expect(seen.headers?.get('x-anx-client')).toBe(sdkClientHeaderValue());
    expect(seen.headers?.get('x-anx-app')).toBeNull();
    expect(JSON.parse(seen.body || '{}').commandVersion).toBe(1);
    client.dispose();
  });
});
