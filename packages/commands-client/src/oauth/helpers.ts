import { createRequestId } from '../utils.js';

export type PkcePair = {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
};

function base64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  const b64 =
    typeof btoa === 'function'
      ? btoa(str)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkce(): Promise<PkcePair> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64Url(verifierBytes);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  );
  return {
    codeVerifier,
    codeChallenge: base64Url(digest),
    codeChallengeMethod: 'S256',
  };
}

export function generateOAuthState(): string {
  return createRequestId();
}

export type AuthorizeUrlParams = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod?: 'S256';
  subjectType?: 'user' | 'org_member';
  orgId?: string;
};

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const base = params.issuer.replace(/\/$/, '');
  const url = new URL(`${base}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', params.codeChallengeMethod || 'S256');
  if (params.scope) url.searchParams.set('scope', params.scope);
  if (params.subjectType) url.searchParams.set('subject_type', params.subjectType);
  if (params.orgId) url.searchParams.set('org_id', params.orgId);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  grant_id?: string;
  subject_type?: string;
  org_id?: string;
  membership_id?: string;
};

export async function exchangeAuthorizationCode(opts: {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenResponse> {
  const fetchImpl = opts.fetchImpl || fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.codeVerifier,
  });
  if (opts.clientSecret) body.set('client_secret', opts.clientSecret);

  const res = await fetchImpl(`${opts.issuer.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(opts: {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenResponse> {
  const fetchImpl = opts.fetchImpl || fetch;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
  });
  if (opts.clientSecret) body.set('client_secret', opts.clientSecret);

  const res = await fetchImpl(`${opts.issuer.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export type IntrospectionResponse = {
  active: boolean;
  scope?: string;
  client_id?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  anx_subject_type?: string;
  anx_grant_id?: string;
  anx_grant_status?: string;
};

export async function introspectToken(opts: {
  issuer: string;
  clientId: string;
  clientSecret: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<IntrospectionResponse> {
  const fetchImpl = opts.fetchImpl || fetch;
  const body = new URLSearchParams({
    token: opts.token,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  const res = await fetchImpl(`${opts.issuer.replace(/\/$/, '')}/oauth2/introspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`introspect failed: ${res.status} ${text}`);
  }
  return (await res.json()) as IntrospectionResponse;
}

export async function fetchUserInfo(opts: {
  issuer: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const fetchImpl = opts.fetchImpl || fetch;
  const res = await fetchImpl(`${opts.issuer.replace(/\/$/, '')}/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`userinfo failed: ${res.status} ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function revokeToken(opts: {
  issuer: string;
  token: string;
  clientId: string;
  clientSecret?: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = opts.fetchImpl || fetch;
  const body = new URLSearchParams({
    token: opts.token,
    client_id: opts.clientId,
  });
  if (opts.clientSecret) body.set('client_secret', opts.clientSecret);
  if (opts.tokenTypeHint) body.set('token_type_hint', opts.tokenTypeHint);
  const res = await fetchImpl(`${opts.issuer.replace(/\/$/, '')}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`revoke failed: ${res.status} ${text}`);
  }
}

export async function fetchDiscovery(opts: {
  issuer: string;
  fetchImpl?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const fetchImpl = opts.fetchImpl || fetch;
  const base = opts.issuer.replace(/\/$/, '');
  const res = await fetchImpl(`${base}/.well-known/openid-configuration`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`discovery failed: ${res.status} ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export type Jwks = { keys: Array<Record<string, unknown> & { kid?: string }> };

export class JwksCache {
  private cache: { jwks: Jwks; fetchedAt: number } | null = null;
  private negativeUntil = 0;
  private readonly ttlMs: number;
  private readonly negativeTtlMs: number;
  private readonly minRefreshIntervalMs: number;
  private lastRefreshAt = 0;

  constructor(
    private issuer: string,
    private fetchImpl: typeof fetch = fetch,
    opts?: { ttlMs?: number; negativeTtlMs?: number; minRefreshIntervalMs?: number },
  ) {
    this.ttlMs = opts?.ttlMs ?? 60 * 60 * 1000;
    this.negativeTtlMs = opts?.negativeTtlMs ?? 30_000;
    this.minRefreshIntervalMs = opts?.minRefreshIntervalMs ?? 5_000;
  }

  async getKey(kid?: string): Promise<Record<string, unknown> | null> {
    const jwks = await this.getJwks();
    if (!jwks) return null;
    if (kid) {
      return jwks.keys.find((k) => k.kid === kid) || null;
    }
    return jwks.keys[0] || null;
  }

  async getJwks(force = false): Promise<Jwks | null> {
    const now = Date.now();
    if (!force && this.cache && now - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.jwks;
    }
    if (!force && now < this.negativeUntil) return null;
    if (!force && now - this.lastRefreshAt < this.minRefreshIntervalMs && this.cache) {
      return this.cache.jwks;
    }
    this.lastRefreshAt = now;
    try {
      const res = await this.fetchImpl(
        `${this.issuer.replace(/\/$/, '')}/.well-known/jwks.json`,
      );
      if (!res.ok) {
        this.negativeUntil = now + this.negativeTtlMs;
        return this.cache?.jwks || null;
      }
      const jwks = (await res.json()) as Jwks;
      this.cache = { jwks, fetchedAt: now };
      return jwks;
    } catch {
      this.negativeUntil = now + this.negativeTtlMs;
      return this.cache?.jwks || null;
    }
  }
}

/** Clock skew tolerance for id_token validation (seconds). */
export const ID_TOKEN_CLOCK_SKEW_SECONDS = 60;
