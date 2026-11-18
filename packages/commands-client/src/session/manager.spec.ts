import { describe, expect, it, vi } from 'vitest';
import { createNexusSessionManager } from './manager.js';
import type { NexusSessionRecord, NexusSessionStore } from './types.js';

function memoryStore(seed: NexusSessionRecord[] = []): NexusSessionStore & {
  rows: Map<string, NexusSessionRecord>;
} {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]));
  return {
    rows,
    get: (id) => rows.get(id),
    set: (record) => {
      rows.set(record.id, { ...record });
    },
    delete: (id) => {
      rows.delete(id);
    },
    list: () => [...rows.values()],
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tokenBody(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'access-1',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'refresh-1',
    subject_type: 'user',
    ...overrides,
  };
}

function manager(store: NexusSessionStore, fetchImpl: typeof fetch) {
  return createNexusSessionManager({
    issuer: 'https://region.example',
    clientId: 'client-1',
    clientSecret: 'secret',
    redirectUri: 'http://127.0.0.1:8787/callback',
    store,
    fetchImpl,
    newSessionId: () => 'session-1',
  });
}

describe('startLogin', () => {
  it('stores the intent and builds a PKCE authorize URL', async () => {
    const store = memoryStore();
    const sessions = manager(store, vi.fn() as unknown as typeof fetch);
    const started = await sessions.startLogin({ subjectType: 'org_member', orgId: 'org-1', returnTo: '/plants' });
    expect(started.sessionId).toBe('session-1');
    expect(started.authorizeUrl).toContain('/oauth2/authorize');
    expect(started.authorizeUrl).toContain('code_challenge_method=S256');
    expect(started.authorizeUrl).toContain('subject_type=org_member');
    expect(started.authorizeUrl).toContain('org_id=org-1');
    const row = store.rows.get('session-1');
    expect(row?.intent).toMatchObject({ subjectType: 'org_member', orgId: 'org-1', returnTo: '/plants' });
    expect(row?.intent?.codeVerifier).toBeTruthy();
  });

  it('drops an unsafe returnTo', async () => {
    const store = memoryStore();
    const sessions = manager(store, vi.fn() as unknown as typeof fetch);
    await sessions.startLogin({ subjectType: 'user', returnTo: 'https://evil.example' });
    expect(store.rows.get('session-1')?.intent?.returnTo).toBeUndefined();
  });
});

describe('completeLogin', () => {
  it('exchanges the code and stores the tokens', async () => {
    const store = memoryStore();
    const fetchImpl = vi.fn(async () => json(tokenBody())) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const started = await sessions.startLogin({ subjectType: 'user', returnTo: '/plants' });
    const state = store.rows.get(started.sessionId)?.intent?.state as string;
    const completed = await sessions.completeLogin({ sessionId: started.sessionId, code: 'code-1', state });
    expect(completed.returnTo).toBe('/plants');
    const row = store.rows.get(started.sessionId);
    expect(row?.accessToken).toBe('access-1');
    expect(row?.refreshToken).toBe('refresh-1');
    expect(row?.intent).toBeUndefined();
  });

  it('rejects a state mismatch', async () => {
    const store = memoryStore();
    const sessions = manager(store, vi.fn() as unknown as typeof fetch);
    const started = await sessions.startLogin({ subjectType: 'user' });
    await expect(
      sessions.completeLogin({ sessionId: started.sessionId, code: 'c', state: 'wrong' }),
    ).rejects.toMatchObject({ code: 'INVALID_GRANT' });
  });

  it('rejects an unknown session', async () => {
    const sessions = manager(memoryStore(), vi.fn() as unknown as typeof fetch);
    await expect(
      sessions.completeLogin({ sessionId: 'nope', code: 'c', state: 's' }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});

describe('refresh and revoke', () => {
  it('refreshes and rotates the tokens', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'old', refreshToken: 'r1' }]);
    const fetchImpl = vi.fn(async () =>
      json(tokenBody({ access_token: 'new', refresh_token: 'r2' })),
    ) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    expect(await sessions.refresh('s1')).toEqual({ ok: true });
    expect(store.rows.get('s1')?.accessToken).toBe('new');
    expect(store.rows.get('s1')?.refreshToken).toBe('r2');
  });

  it('reports a missing refresh token without calling the region', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const result = await sessions.refresh('s1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('REFRESH_MISSING');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('revokes and deletes the session', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a', refreshToken: 'r' }]);
    const fetchImpl = vi.fn(async () => json({})) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    expect(await sessions.revoke('s1')).toEqual({ ok: true });
    expect(store.rows.has('s1')).toBe(false);
  });

  it('still deletes the session when the region revoke fails', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a', refreshToken: 'r' }]);
    const fetchImpl = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const result = await sessions.revoke('s1');
    expect(result.ok).toBe(false);
    expect(store.rows.has('s1')).toBe(false);
  });
});

describe('sendCommand', () => {
  it('requires a login when the session has no token', async () => {
    const sessions = manager(memoryStore([{ id: 's1' }]), vi.fn() as unknown as typeof fetch);
    const result = await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    expect(result.responseCode).toBe(401);
    expect(result.errorCode).toBe('NEXUS_LOGIN_REQUIRED');
  });

  it('forwards the envelope with the bearer token', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'token-1' }]);
    const fetchImpl = vi.fn(async () =>
      json({ responseCode: 200, responseObject: { ok: true } }),
    ) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const result = await sessions.sendCommand('s1', 'anx.communicate.conversations.list', { limit: 5 });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://region.example/command/anx.communicate.conversations.list');
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(JSON.parse(String(init.body))).toMatchObject({
      command: 'anx.communicate.conversations.list',
      payload: { limit: 5 },
      identity: { type: 'app' },
    });
  });

  it('refreshes once and retries on a 401', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'expired', refreshToken: 'r1' }]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ responseCode: 401 }, 401))
      .mockResolvedValueOnce(json(tokenBody({ access_token: 'fresh', refresh_token: 'r2' })))
      .mockResolvedValueOnce(json({ responseCode: 200, responseObject: { ok: true } })) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const result = await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    expect(result.ok).toBe(true);
    const last = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[2];
    expect((last[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer fresh' });
  });

  it('surfaces the refresh failure when the retry cannot happen', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'expired', refreshToken: 'r1' }]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ responseCode: 401 }, 401))
      .mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400)) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const result = await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    expect(result.responseCode).toBe(401);
    expect(result.errorCode).toBe('INVALID_GRANT');
  });

  it('reports the region as unavailable on a transport failure', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const result = await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    expect(result.errorCode).toBe('NEXUS_UNAVAILABLE');
  });
});

describe('probe, view, identities, switchIdentity, restore', () => {
  it('probes grant_required without a token', async () => {
    const sessions = manager(memoryStore([{ id: 's1' }]), vi.fn() as unknown as typeof fetch);
    expect(await sessions.probe('s1')).toBe('grant_required');
  });

  it('probes granted when the read succeeds', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn(async () => json({ responseCode: 200, responseObject: {} })) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    expect(await sessions.probe('s1')).toBe('granted');
  });

  it('builds the session view from the token', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a', subjectType: 'org_member', orgId: 'org-1' }]);
    const sessions = manager(store, vi.fn() as unknown as typeof fetch);
    const view = await sessions.view('s1');
    expect(view).toMatchObject({ signedIn: true, level: 'tenant', orgId: 'org-1' });
  });

  it('switches identity by starting a new authorize', async () => {
    const store = memoryStore();
    const sessions = manager(store, vi.fn() as unknown as typeof fetch);
    const switched = await sessions.switchIdentity('old', { subjectType: 'org_member', orgId: 'org-2' });
    expect(switched.authorizeUrl).toContain('subject_type=org_member');
    expect(switched.authorizeUrl).toContain('org_id=org-2');
  });

  it('restores a session by minting an access token', async () => {
    const store = memoryStore([{ id: 's1', refreshToken: 'r1' }]);
    const fetchImpl = vi.fn(async () => json(tokenBody())) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    expect(await sessions.restore('s1')).toEqual({ ok: true });
    expect(store.rows.get('s1')?.accessToken).toBe('access-1');
  });

  it('restore is a no-op when an access token is already present', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    expect(await sessions.restore('s1')).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('events', () => {
  it('emits lifecycle and command events to a subscriber', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn(async () => json({ responseCode: 200, responseObject: {} })) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const seen: string[] = [];
    const off = sessions.events.on('*', (event) => seen.push(event.type));
    await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    off();
    expect(seen).toContain('command.sent');
  });

  it('filters by type and by predicate', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn(async () => json({ responseCode: 200, responseObject: {} })) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    const crm: string[] = [];
    const off = sessions.events.on(
      (event) => event.type === 'command.sent' && event.command.startsWith('anx.crm.'),
      (event) => crm.push(event.type),
    );
    await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    await sessions.sendCommand('s1', 'anx.crm.lead.list');
    off();
    expect(crm).toEqual(['command.sent']);
  });

  it('lets a host publish its own events on the same rail', () => {
    const sessions = manager(memoryStore(), vi.fn() as unknown as typeof fetch);
    const seen: string[] = [];
    sessions.events.on('app.pageview', (event) => seen.push(event.type));
    sessions.events.emit({ type: 'app.pageview', path: '/plants' });
    expect(seen).toEqual(['app.pageview']);
  });

  it('a throwing subscriber does not break the command', async () => {
    const store = memoryStore([{ id: 's1', accessToken: 'a' }]);
    const fetchImpl = vi.fn(async () => json({ responseCode: 200, responseObject: {} })) as unknown as typeof fetch;
    const sessions = manager(store, fetchImpl);
    sessions.events.on('*', () => {
      throw new Error('subscriber blew up');
    });
    const result = await sessions.sendCommand('s1', 'anx.communicate.conversations.list');
    expect(result.ok).toBe(true);
  });
});
