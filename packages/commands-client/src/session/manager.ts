/**
 * Server-side Nexus session manager.
 *
 * One object that owns the Nexus-specific session and identity logic, so a host
 * app does not re-implement it:
 *
 * - start / complete a Login with Nexus round-trip (PKCE, single-use state)
 * - refresh and revoke, with typed errors
 * - send a command with the session's token, refreshing once on a 401
 * - probe availability so a missing grant is never mistaken for an outage
 * - switch identity (personal ↔ org membership) as a new authorize
 *
 * Persistence is the host's: pass any `NexusSessionStore`. A single-user app can
 * keep one record; a multi-tenant app can key by its own session id and hold
 * several identities per user.
 */
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generateOAuthState,
  generatePkce,
  refreshAccessToken,
  revokeToken,
  type TokenResponse,
} from '../oauth/helpers.js';
import {
  buildSessionView,
  decodeAppTokenClaims,
  safeReturnTo,
} from './identity.js';
import { classifyNexusProbe, classifyTokenError, tokenError } from './errors.js';
import { createNexusEventBus } from './events.js';
import type {
  NexusAccessProbe,
  NexusCommandOutcome,
  NexusSessionManager,
  NexusSessionManagerOptions,
  NexusSessionRecord,
  NexusSessionView,
  NexusSubjectType,
  NexusTokenResult,
} from './types.js';

export type {
  NexusAccessProbe,
  NexusCommandOutcome,
  NexusIdentityLevel,
  NexusLoginIntent,
  NexusSessionManager,
  NexusSessionManagerOptions,
  NexusSessionRecord,
  NexusSessionStore,
  NexusSessionView,
  NexusSubjectType,
  NexusTokenError,
  NexusTokenErrorCode,
  NexusTokenResult,
} from './types.js';

const DEFAULT_SCOPE = 'openid';

function defaultSessionId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `nx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function requestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function envelopeErrorCode(json: Record<string, unknown>): string | undefined {
  const errors = json.errorObjects;
  if (Array.isArray(errors) && errors.length) {
    const first = errors[0] as Record<string, unknown> | undefined;
    const code = first?.code ?? first?.errorCode;
    if (typeof code === 'string' && code) return code;
  }
  const direct = json.errorCode ?? json.code;
  return typeof direct === 'string' && direct ? direct : undefined;
}

function envelopeMessage(json: Record<string, unknown>): string | undefined {
  const errors = json.errorObjects;
  if (Array.isArray(errors) && errors.length) {
    const first = errors[0] as Record<string, unknown> | undefined;
    if (typeof first?.message === 'string' && first.message) return first.message;
  }
  return typeof json.message === 'string' && json.message ? json.message : undefined;
}

export function createNexusSessionManager(
  opts: NexusSessionManagerOptions,
): NexusSessionManager {
  const issuer = opts.issuer.replace(/\/+$/, '');
  const fetchImpl = opts.fetchImpl || fetch;
  const newSessionId = opts.newSessionId || defaultSessionId;
  const scope = opts.scope || DEFAULT_SCOPE;
  const events =
    opts.events ||
    createNexusEventBus({
      onError: (err, event) =>
        opts.logger?.warn?.('nexus_event_listener_failed', {
          event: event.type,
          detail: err instanceof Error ? err.message : 'listener failed',
        }),
    });

  async function read(id: string): Promise<NexusSessionRecord | undefined> {
    return await opts.store.get(id);
  }

  async function write(record: NexusSessionRecord): Promise<void> {
    await opts.store.set(record);
  }

  function applyToken(record: NexusSessionRecord, token: TokenResponse): NexusSessionRecord {
    const next: NexusSessionRecord = {
      ...record,
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.subject_type ? { subjectType: token.subject_type as NexusSubjectType } : {}),
      ...(token.org_id ? { orgId: token.org_id } : {}),
    };
    const claims = decodeAppTokenClaims(token.access_token);
    if (typeof claims?.exp === 'number') next.accessExpiresAt = claims.exp * 1000;
    return next;
  }

  async function startLogin(input: {
    subjectType: NexusSubjectType;
    orgId?: string;
    returnTo?: string;
  }): Promise<{ sessionId: string; authorizeUrl: string }> {
    const pkce = await generatePkce();
    const state = generateOAuthState();
    const sessionId = newSessionId();
    const returnTo = safeReturnTo(input.returnTo);
    const record: NexusSessionRecord = {
      id: sessionId,
      intent: {
        state,
        codeVerifier: pkce.codeVerifier,
        subjectType: input.subjectType,
        ...(input.orgId ? { orgId: input.orgId.trim() } : {}),
        ...(returnTo ? { returnTo } : {}),
      },
    };
    await write(record);
    const authorizeUrl = buildAuthorizeUrl({
      issuer,
      clientId: opts.clientId,
      redirectUri: opts.redirectUri,
      state,
      codeChallenge: pkce.codeChallenge,
      subjectType: input.subjectType,
      ...(input.orgId ? { orgId: input.orgId.trim() } : {}),
      scope,
    });
    opts.logger?.info?.('nexus_login_started', { subjectType: input.subjectType });
    events.emit({ type: 'session.started', sessionId, subjectType: input.subjectType });
    return { sessionId, authorizeUrl };
  }

  async function completeLogin(input: {
    sessionId: string;
    code: string;
    state: string;
  }): Promise<{ sessionId: string; returnTo?: string }> {
    const record = await read(input.sessionId);
    if (!record) {
      throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' });
    }
    if (!record.intent || record.intent.state !== input.state) {
      throw Object.assign(new Error('OAuth state does not match this session'), {
        code: 'INVALID_GRANT',
      });
    }
    const token = await exchangeAuthorizationCode({
      issuer,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      code: input.code,
      redirectUri: opts.redirectUri,
      codeVerifier: record.intent.codeVerifier,
      fetchImpl,
    });
    const returnTo = record.intent.returnTo;
    const next = applyToken(record, token);
    next.intent = undefined;
    await write(next);
    opts.logger?.info?.('nexus_login_completed', { subjectType: next.subjectType || null });
    events.emit({
      type: 'session.completed',
      sessionId: next.id,
      level: buildSessionView({ accessToken: next.accessToken, subjectType: next.subjectType, orgId: next.orgId }).level,
    });
    return { sessionId: next.id, ...(returnTo ? { returnTo } : {}) };
  }

  async function refresh(sessionId: string): Promise<NexusTokenResult> {
    const record = await read(sessionId);
    if (!record) return { ok: false, error: tokenError('SESSION_NOT_FOUND', 'Session not found.') };
    if (!record.refreshToken) {
      return { ok: false, error: tokenError('REFRESH_MISSING', 'No refresh token on this session.') };
    }
    try {
      const token = await refreshAccessToken({
        issuer,
        clientId: opts.clientId,
        clientSecret: opts.clientSecret,
        refreshToken: record.refreshToken,
        fetchImpl,
      });
      await write(applyToken(record, token));
      events.emit({ type: 'session.refreshed', sessionId });
      return { ok: true };
    } catch (err) {
      const error = classifyTokenError(err);
      events.emit({ type: 'session.failed', sessionId, code: error.code });
      return { ok: false, error };
    }
  }

  async function revoke(sessionId: string): Promise<NexusTokenResult> {
    const record = await read(sessionId);
    if (!record) return { ok: true };
    const token = record.refreshToken || record.accessToken;
    if (token) {
      try {
        await revokeToken({
          issuer,
          token,
          clientId: opts.clientId,
          clientSecret: opts.clientSecret,
          tokenTypeHint: record.refreshToken ? 'refresh_token' : 'access_token',
          fetchImpl,
        });
      } catch (err) {
        // A revoke that fails must not keep the local session alive: the user
        // asked to sign out. Report the error but still clear locally.
        const error = classifyTokenError(err);
        await opts.store.delete(sessionId);
        events.emit({ type: 'session.revoked', sessionId });
        return { ok: false, error };
      }
    }
    await opts.store.delete(sessionId);
    events.emit({ type: 'session.revoked', sessionId });
    return { ok: true };
  }

  async function sendCommand(
    sessionId: string,
    command: string,
    payload: Record<string, unknown> = {},
  ): Promise<NexusCommandOutcome> {
    const startedAt = Date.now();
    const record = await read(sessionId);
    if (!record?.accessToken) {
      events.emit({
        type: 'command.failed',
        sessionId,
        command,
        responseCode: 401,
        code: 'NEXUS_LOGIN_REQUIRED',
      });
      return {
        ok: false,
        responseCode: 401,
        data: null,
        errorCode: 'NEXUS_LOGIN_REQUIRED',
        message: 'Sign in with Nexus to use this feature.',
      };
    }

    const post = async (accessToken: string): Promise<{ status: number; json: Record<string, unknown> }> => {
      const res = await fetchImpl(`${issuer}/command/${encodeURIComponent(command)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          command,
          requestId: requestId(),
          payload,
          identity: { type: 'app' },
          responseExpected: true,
          timestamp: new Date().toISOString(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, json };
    };

    let result: { status: number; json: Record<string, unknown> };
    try {
      result = await post(record.accessToken);
    } catch (err) {
      return {
        ok: false,
        responseCode: 0,
        data: null,
        errorCode: 'NEXUS_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'The region could not be reached.',
      };
    }

    // One refresh + retry on an expired access token.
    if (result.status === 401 && record.refreshToken) {
      const refreshed = await refresh(sessionId);
      const latest = await read(sessionId);
      if (refreshed.ok && latest?.accessToken) {
        try {
          result = await post(latest.accessToken);
        } catch (err) {
          return {
            ok: false,
            responseCode: 0,
            data: null,
            errorCode: 'NEXUS_UNAVAILABLE',
            message: err instanceof Error ? err.message : 'The region could not be reached.',
          };
        }
      } else if (!refreshed.ok) {
        return {
          ok: false,
          responseCode: 401,
          data: null,
          errorCode: refreshed.error.code,
          message: refreshed.error.message,
        };
      }
    }

    const responseCode = Number(result.json.responseCode ?? result.status ?? 0);
    const ok = responseCode >= 200 && responseCode < 300;
    const errorCode = envelopeErrorCode(result.json);
    events.emit({
      type: 'command.sent',
      sessionId,
      command,
      ok,
      responseCode,
      durationMs: Date.now() - startedAt,
    });
    if (!ok) {
      events.emit({ type: 'command.failed', sessionId, command, responseCode, ...(errorCode ? { code: errorCode } : {}) });
    }
    return {
      ok,
      responseCode,
      data: result.json.responseObject ?? result.json.data ?? result.json,
      errorCode,
      message: envelopeMessage(result.json),
    };
  }

  async function probe(sessionId: string): Promise<NexusAccessProbe> {
    const record = await read(sessionId);
    if (!record?.accessToken) return 'grant_required';
    const result = await sendCommand(sessionId, 'anx.communicate.conversations.list', {
      limit: 1,
      status: 'active',
    });
    const probeResult = classifyNexusProbe({ code: result.errorCode, responseCode: result.responseCode });
    events.emit({ type: 'probe', sessionId, result: probeResult });
    return probeResult;
  }

  async function view(sessionId: string): Promise<NexusSessionView> {
    const record = await read(sessionId);
    return buildSessionView({
      accessToken: record?.accessToken,
      subjectType: record?.subjectType,
      orgId: record?.orgId,
    });
  }

  async function identities(sessionId: string): Promise<unknown> {
    const result = await sendCommand(sessionId, 'anx.oauth2.subject.identities.list');
    return result.data;
  }

  async function switchIdentity(
    sessionId: string,
    input: { subjectType: NexusSubjectType; orgId?: string; returnTo?: string },
  ): Promise<{ sessionId: string; authorizeUrl: string }> {
    // A different identity is a new consent, not a local flag: start a fresh
    // authorize and let the region issue a grant for that subject.
    const started = await startLogin(input);
    opts.logger?.info?.('nexus_identity_switch', {
      from: sessionId,
      to: started.sessionId,
      subjectType: input.subjectType,
    });
    events.emit({
      type: 'identity.switched',
      from: sessionId,
      to: started.sessionId,
      subjectType: input.subjectType,
    });
    return started;
  }

  async function restore(sessionId: string): Promise<NexusTokenResult> {
    const record = await read(sessionId);
    if (!record) return { ok: false, error: tokenError('SESSION_NOT_FOUND', 'Session not found.') };
    if (record.accessToken) return { ok: true };
    return refresh(sessionId);
  }

  async function accessToken(sessionId: string): Promise<string | null> {
    const record = await read(sessionId);
    return record?.accessToken || null;
  }

  return {
    startLogin,
    completeLogin,
    refresh,
    revoke,
    sendCommand,
    probe,
    view,
    identities,
    switchIdentity,
    restore,
    accessToken,
    events,
  };
}
