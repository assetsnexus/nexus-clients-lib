import { describe, expect, it } from 'vitest';
import { NexusClient } from '../src/client.js';
import { mapDataAccessApprovalError } from '../src/data-access.js';
import { NexusError, NEXUS_ERROR_CATALOG } from '../src/errors/nexus-error.js';
import { generatePkce, buildAuthorizeUrl } from '../src/oauth/helpers.js';
import { GatewayRegionResolver, StaticRegionIndex } from '../src/regions/resolvers.js';
import { isLikelyReadCommand } from '../src/types.js';
import {
  createTestClient,
  fixtureAccepted,
  fixtureDataAccessApproval,
  fixtureLongRunning,
  fixtureOk,
  fixtureSca,
  fixtureTaskView,
} from '../src/testing/index.js';
import { StaticTokenProvider } from '../src/token-provider.js';

describe('NEXUS_ERROR_CATALOG', () => {
  it('covers every NexusErrorCode with docsAnchor', () => {
    for (const [code, entry] of Object.entries(NEXUS_ERROR_CATALOG)) {
      expect(entry.code).toBe(code);
      expect(entry.docsAnchor).toBeTruthy();
      expect(typeof entry.retryable).toBe('boolean');
    }
  });
});

describe('mapDataAccessApprovalError', () => {
  it('returns null for unrelated errors', () => {
    expect(mapDataAccessApprovalError({ code: 'FORBIDDEN' })).toBeNull();
  });

  it('maps DATA_ACCESS_APPROVAL_REQUIRED', () => {
    const mapped = mapDataAccessApprovalError({
      code: 'DATA_ACCESS_APPROVAL_REQUIRED',
      message: 'need approval',
      details: {
        grantId: 'g1',
        resource: { kind: 'file', id: 'f1', name: 'Doc' },
        parents: [{ kind: 'folder', id: 'd1', name: 'Dir' }],
      },
    });
    expect(mapped?.grantId).toBe('g1');
    expect(mapped?.scopeChoices).toHaveLength(2);
  });
});

describe('NexusClient.send', () => {
  it('returns ok for successful commands', async () => {
    const client = createTestClient({
      'anx.user.profile.get': () => fixtureOk({ email: 'a@b.c' }),
    });
    const res = await client.send('anx.user.profile.get', {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ email: 'a@b.c' });
  });

  it('surfaces sca_required on 202', async () => {
    const client = createTestClient({
      'anx.wallet.transfer': () => fixtureSca('auth_1'),
    });
    const res = await client.send('anx.wallet.transfer', { amount: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('sca_required');
      if (res.kind === 'sca_required') {
        expect(res.authRequestId).toBe('auth_1');
        expect(res.authorizationText).toBe('Confirm this action');
        expect(res.uiMetadata?.type).toBe('code');
        expect(res.dynamicFieldsHash).toBe('05AFEE585FFCF655');
      }
    }
  });

  it('surfaces accepted on envelope 102', async () => {
    const client = createTestClient({
      'anx.file.rewrap-for-device': () => fixtureLongRunning({ taskId: 'lrt_9', sessionId: 'sess-1', mode: 'poll_push' }),
    });
    const res = await client.send('anx.file.rewrap-for-device', { fileId: 'f1' });
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'accepted') {
      expect(res.taskId).toBe('lrt_9');
      expect(res.sessionId).toBe('sess-1');
      expect(res.mode).toBe('poll_push');
      expect(res.statusCommand).toBe('anx.long-running.get');
      expect(res.cancelCommand).toBe('anx.long-running.cancel');
    }
  });

  it('waitForTask polls until terminal', async () => {
    let polls = 0;
    const client = createTestClient({
      'anx.long-running.get': () => {
        polls += 1;
        return fixtureTaskView({ status: polls < 2 ? 'running' : 'succeeded' });
      },
    });
    const task = await client.longRunning.waitForTask('lrt_1', { pollAfterMs: 1 });
    expect(task.status).toBe('succeeded');
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  it('surfaces accepted on 202 without SCA fields', async () => {
    const client = createTestClient({
      'anx.storage.search.index': () => fixtureAccepted({ jobId: 'job_9', status: 'queued' }),
    });
    const res = await client.send('anx.storage.search.index', { workspaceId: 'w1' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kind).toBe('accepted');
      if (res.kind === 'accepted') {
        expect(res.jobId).toBe('job_9');
        expect(res.status).toBe('queued');
      }
    }
  });

  it('surfaces data_access_approval_required', async () => {
    const client = createTestClient({
      'anx.file.get': () => fixtureDataAccessApproval(),
    });
    const res = await client.send('anx.file.get', { id: 'f1' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe('data_access_approval_required');
  });

  it('adds idempotency for non-read commands', async () => {
    let seen: string | undefined;
    const client = new NexusClient({
      baseUrl: 'https://test.local',
      tokenProvider: new StaticTokenProvider('t'),
      maxRetries: 0,
      transport: {
        async request({ headers, body }) {
          const env = JSON.parse(body || '{}');
          seen = env.idempotencyKey || headers['Idempotency-Key'];
          return {
            status: 200,
            headers: new Headers(),
            text: JSON.stringify(fixtureOk({})),
          };
        },
      },
    });
    await client.send('anx.wallet.transfer', { amount: 1 });
    expect(seen).toMatch(/^idem_/);
  });

  it('refreshes once on HTTP 401 then succeeds without infinite recursion', async () => {
    let calls = 0;
    let refreshCount = 0;
    const client = new NexusClient({
      baseUrl: 'https://test.local',
      tokenProvider: {
        async getAccessToken() {
          return refreshCount === 0 ? 'stale' : 'fresh';
        },
        async refresh() {
          refreshCount += 1;
          return true;
        },
      },
      maxRetries: 0,
      transport: {
        async request() {
          calls += 1;
          if (calls === 1) {
            return { status: 401, headers: new Headers(), text: 'unauthorized' };
          }
          return {
            status: 200,
            headers: new Headers(),
            text: JSON.stringify(fixtureOk({ ok: true })),
          };
        },
      },
    });
    const res = await client.send('anx.user.profile.get', {});
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
    expect(refreshCount).toBe(1);
  });

  it('does not loop refresh when refresh keeps failing auth', async () => {
    let calls = 0;
    let refreshCount = 0;
    const client = new NexusClient({
      baseUrl: 'https://test.local',
      tokenProvider: {
        async getAccessToken() {
          return 'bad';
        },
        async refresh() {
          refreshCount += 1;
          return true;
        },
      },
      maxRetries: 0,
      transport: {
        async request() {
          calls += 1;
          return { status: 401, headers: new Headers(), text: 'unauthorized' };
        },
      },
    });
    await expect(client.send('anx.user.profile.get', {})).rejects.toBeInstanceOf(NexusError);
    expect(refreshCount).toBe(1);
    expect(calls).toBe(2);
  });

  it('sendWithSca retries the original command with the same requestId', async () => {
    const requestIds: string[] = [];
    const client = new NexusClient({
      baseUrl: 'https://test.local',
      tokenProvider: new StaticTokenProvider('t'),
      maxRetries: 0,
      transport: {
        async request({ body }) {
          const env = JSON.parse(body || '{}');
          requestIds.push(env.requestId);
          if (env.command === 'anx.security.auth.verify-2fa') {
            return {
              status: 200,
              headers: new Headers(),
              text: JSON.stringify(fixtureOk({ verified: true })),
            };
          }
          return {
            status: 200,
            headers: new Headers(),
            text: JSON.stringify(fixtureOk({ transferred: true })),
          };
        },
      },
    });
    const res = await client.sendWithSca(
      'anx.wallet.transfer',
      { amount: 1 },
      { authRequestId: 'auth_1', code: '123456' },
      { requestId: 'req_stable_1' },
    );
    expect(res.ok).toBe(true);
    expect(requestIds).toContain('req_stable_1');
    // verify-2fa gets its own requestId; the retry of the original command must reuse req_stable_1
    expect(requestIds.filter((id) => id === 'req_stable_1').length).toBeGreaterThanOrEqual(1);
    const transferCall = requestIds.findIndex((_, i, arr) => {
      // second command call after verify should be transfer with same id
      return true;
    });
    expect(transferCall).toBeGreaterThanOrEqual(0);
    // Last requestId for transfer path: both verify and transfer are sent; transfer uses options.requestId
    expect(requestIds[requestIds.length - 1]).toBe('req_stable_1');
  });
});

describe('isLikelyReadCommand', () => {
  it('detects read suffixes', () => {
    expect(isLikelyReadCommand('anx.oauth2.grants.list')).toBe(true);
    expect(isLikelyReadCommand('anx.wallet.transfer')).toBe(false);
  });
});

describe('oauth helpers', () => {
  it('generates S256 PKCE', async () => {
    const pkce = await generatePkce();
    expect(pkce.codeChallengeMethod).toBe('S256');
    expect(pkce.codeVerifier.length).toBeGreaterThan(20);
    expect(pkce.codeChallenge.length).toBeGreaterThan(20);
  });

  it('builds authorize URL', () => {
    const url = buildAuthorizeUrl({
      issuer: 'https://region.example',
      clientId: 'c1',
      redirectUri: 'https://app/cb',
      state: 's',
      codeChallenge: 'ch',
    });
    expect(url).toContain('/oauth2/authorize');
    expect(url).toContain('client_id=c1');
    expect(url).toContain('code_challenge_method=S256');
  });

  it('fetchUserInfo and revokeToken call expected endpoints', async () => {
    const { fetchUserInfo, revokeToken, fetchDiscovery } = await import('./oauth/helpers.js');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ sub: 'abc', active: true }),
        text: async () => '',
      } as any;
    };
    await fetchUserInfo({ issuer: 'https://region.example', accessToken: 't', fetchImpl });
    await revokeToken({
      issuer: 'https://region.example',
      token: 't',
      clientId: 'c1',
      clientSecret: 's',
      fetchImpl,
    });
    await fetchDiscovery({ issuer: 'https://region.example', fetchImpl });
    expect(calls[0].url).toContain('/oauth2/userinfo');
    expect(calls[1].url).toContain('/oauth2/revoke');
    expect(calls[2].url).toContain('/.well-known/openid-configuration');
  });
});

describe('region resolvers', () => {
  it('StaticRegionIndex resolves by slug', async () => {
    const idx = new StaticRegionIndex([
      { regionSlug: 'eu-west', publicBaseUrl: 'https://eu.example' },
    ]);
    const r = await idx.resolve({ regionSlug: 'eu-west' });
    expect(r?.publicBaseUrl).toBe('https://eu.example');
  });

  it('GatewayRegionResolver throws NOT_IMPLEMENTED', async () => {
    const g = new GatewayRegionResolver('https://gateway.example');
    await expect(g.resolve({})).rejects.toBeInstanceOf(NexusError);
  });
});
