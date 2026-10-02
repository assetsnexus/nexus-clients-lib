import { afterEach, describe, expect, it } from 'vitest';
import { NexusClient } from '../client.js';
import type { RegionRoutes } from '../regions/region-routes.js';
import { classifyCommandRequest, commandNameFromPath } from './command-classify.js';
import { RoutedTransport } from './routed-transport.js';

const twoRoutes: RegionRoutes = {
  slug: 'eu-west',
  routes: [
    { url: 'https://primary.example', priority: 1, kind: 'primary' },
    { url: 'https://alt.example', priority: 2, kind: 'alternative' },
  ],
};

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function okEnvelope(): Response {
  return new Response(JSON.stringify({ responseCode: 200, data: { ok: true } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type Failure = 'timeout' | 'reset' | 503;

/** Primary fails with `failure`; alt answers 200. Records non-health calls. */
function flakyPrimaryFetch(failure: Failure, calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/health')) return new Response('{}', { status: 200 });
    calls.push(url);
    if (url.startsWith('https://primary.example')) {
      if (failure === 503) return new Response('{}', { status: 503 });
      if (failure === 'timeout') throw codedError('ETIMEDOUT', 'request timed out');
      throw codedError('ECONNRESET', 'socket hang up');
    }
    return okEnvelope();
  }) as typeof fetch;
}

describe('commandNameFromPath', () => {
  it('extracts and decodes the command name', () => {
    expect(commandNameFromPath('/command/anx.user.profile.get')).toBe('anx.user.profile.get');
    expect(commandNameFromPath('/command/anx.a%2Eb?x=1')).toBe('anx.a.b');
  });

  it('returns undefined for non-command paths', () => {
    expect(commandNameFromPath('/health')).toBeUndefined();
    expect(commandNameFromPath('/command/')).toBeUndefined();
  });
});

describe('classifyCommandRequest', () => {
  const post = (path: string, headers: Record<string, string> = {}, isRead?: boolean) => ({
    method: 'POST',
    path,
    headers,
    isRead,
  });

  it('marks read commands as reads without an idempotency key', () => {
    expect(classifyCommandRequest(post('/command/anx.crm.lead.list'))).toEqual({
      isRead: true,
      idempotent: false,
    });
  });

  it('marks write commands as non-read and non-idempotent without a key', () => {
    expect(classifyCommandRequest(post('/command/anx.wallet.transfer'))).toEqual({
      isRead: false,
      idempotent: false,
    });
  });

  it('marks writes idempotent when an idempotency header is present', () => {
    expect(
      classifyCommandRequest(post('/command/anx.wallet.transfer', { 'Idempotency-Key': 'k1' })),
    ).toEqual({ isRead: false, idempotent: true });
  });

  it('lets an explicit isRead hint override name inference in both directions', () => {
    expect(classifyCommandRequest(post('/command/anx.custom.op', {}, true)).isRead).toBe(true);
    expect(classifyCommandRequest(post('/command/anx.crm.lead.list', {}, false)).isRead).toBe(false);
  });
});

describe('NexusClient failover classification', () => {
  const clients: NexusClient[] = [];
  const transports: RoutedTransport[] = [];

  afterEach(() => {
    for (const c of clients) c.dispose();
    for (const t of transports) t.stop();
    clients.length = 0;
    transports.length = 0;
  });

  function client(fetchImpl: typeof fetch): NexusClient {
    const c = new NexusClient({ routes: twoRoutes, fetchImpl, maxRetries: 0 });
    clients.push(c);
    return c;
  }

  it.each<[string, Failure]>([
    ['timeout', 'timeout'],
    ['connection reset', 'reset'],
    ['HTTP 503', 503],
  ])('read command fails over on %s without an idempotency key', async (_label, failure) => {
    const calls: string[] = [];
    const result = await client(flakyPrimaryFetch(failure, calls)).send('anx.crm.lead.list');
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'https://primary.example/command/anx.crm.lead.list',
      'https://alt.example/command/anx.crm.lead.list',
    ]);
  });

  it('explicit isRead:true fails over for a command name that is not read-shaped', async () => {
    const calls: string[] = [];
    const result = await client(flakyPrimaryFetch('timeout', calls)).send(
      'anx.custom.op',
      {},
      { isRead: true },
    );
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it.each<[string, Failure]>([
    ['timeout', 'timeout'],
    ['connection reset', 'reset'],
  ])('write without an idempotency key does not fail over on %s', async (_label, failure) => {
    const calls: string[] = [];
    await expect(
      client(flakyPrimaryFetch(failure, calls)).send(
        'anx.wallet.transfer',
        {},
        { autoIdempotency: false },
      ),
    ).rejects.toThrow();
    expect(calls).toEqual(['https://primary.example/command/anx.wallet.transfer']);
  });

  it('write with an idempotency key fails over on timeout', async () => {
    const calls: string[] = [];
    const result = await client(flakyPrimaryFetch('timeout', calls)).send(
      'anx.wallet.transfer',
      {},
      { idempotencyKey: 'idem_1' },
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'https://primary.example/command/anx.wallet.transfer',
      'https://alt.example/command/anx.wallet.transfer',
    ]);
  });

  it('write with the auto-generated idempotency key fails over on connection reset', async () => {
    const calls: string[] = [];
    const result = await client(flakyPrimaryFetch('reset', calls)).send('anx.wallet.transfer');
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('write does not fail over on 4xx even with a key', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return new Response('{}', { status: 200 });
      calls.push(url);
      return new Response(JSON.stringify({ responseCode: 400, errorObjects: [{ code: 'BAD' }] }), {
        status: 400,
      });
    }) as typeof fetch;
    await client(fetchImpl).send('anx.wallet.transfer', {}, { idempotencyKey: 'idem_2' });
    expect(calls).toEqual(['https://primary.example/command/anx.wallet.transfer']);
  });
});
