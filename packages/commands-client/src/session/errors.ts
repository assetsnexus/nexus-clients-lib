/**
 * Token and availability errors, in the vocabulary a host can render.
 *
 * The region answers a failed refresh with a terse OAuth error. A host that
 * shows "token refresh failed" sends the developer down the wrong path, so this
 * module maps the failure onto a code plus the thing worth checking first.
 */
import { NexusError } from '../errors/nexus-error.js';
import type { NexusAccessProbe, NexusTokenError, NexusTokenErrorCode } from './types.js';

const HINTS: Record<NexusTokenErrorCode, string> = {
  NEXUS_UNAVAILABLE:
    'The region did not answer. Check the issuer URL, the network path from this host, and the region health endpoint.',
  GRANT_REVOKED:
    'The user (or an org admin) revoked this app. Sign in with Nexus again to create a new grant.',
  INVALID_GRANT:
    'The refresh token is expired, already rotated, or belongs to a different client. Sign in again.',
  CLIENT_AUTH_FAILED:
    'The client secret is wrong or was rotated. Copy the current secret from the portal into the client-secret setting and restart.',
  CLOCK_SKEW:
    'This host clock is off. Tokens are rejected when the clock drifts; enable NTP and restart.',
  AUDIENCE_MISMATCH:
    'The token was issued for a different client or issuer. Check that the client id and issuer match the portal entry.',
  REFRESH_MISSING: 'This session has no refresh token. Sign in with Nexus again.',
  SESSION_NOT_FOUND: 'The session is not in the store. Sign in with Nexus again.',
  UNKNOWN: 'Unexpected token error. The host log line carries the region status code.',
};

export function tokenError(code: NexusTokenErrorCode, message: string): NexusTokenError {
  return { code, message, hint: HINTS[code] };
}

/**
 * Classifies a refresh/revoke failure. Deliberately conservative: an unknown
 * shape stays `UNKNOWN` rather than guessing, because a wrong hint sends the
 * developer down the wrong path.
 */
export function classifyTokenError(err: unknown): NexusTokenError {
  if (err instanceof NexusError) {
    const meta = (err.meta || {}) as Record<string, unknown>;
    const oauthError = typeof meta.oauthError === 'string' ? meta.oauthError : '';
    const status = typeof meta.status === 'number' ? meta.status : 0;
    if (oauthError === 'invalid_grant') {
      return tokenError('INVALID_GRANT', 'The region rejected the refresh token (invalid_grant).');
    }
    if (oauthError === 'invalid_client' || status === 401) {
      return tokenError('CLIENT_AUTH_FAILED', 'The region rejected the client credentials.');
    }
    if (oauthError === 'invalid_scope') {
      return tokenError('AUDIENCE_MISMATCH', 'The region rejected the requested scope.');
    }
    if (status >= 500) {
      return tokenError('NEXUS_UNAVAILABLE', `The region returned ${status}.`);
    }
    if (err.code === 'TIMEOUT' || err.code === 'TRANSPORT_ERROR') {
      return tokenError('NEXUS_UNAVAILABLE', 'The region could not be reached.');
    }
    return tokenError('UNKNOWN', err.message || 'Token request failed.');
  }
  if (err instanceof Error) {
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(err.message)) {
      return tokenError('NEXUS_UNAVAILABLE', err.message);
    }
    return tokenError('UNKNOWN', err.message);
  }
  return tokenError('UNKNOWN', 'Token request failed.');
}

/** Codes that mean "the user has to sign in again". */
export function nexusGrantRequired(code: string | null | undefined): boolean {
  return code === 'NO_NEXUS_GRANT' || code === 'NEEDS_NEXUS_LOGIN' || code === 'NEEDS_RELOGIN';
}

/** Grant missing, login expired, or Nexus unreachable. */
export function nexusOfflineCode(code: string | null | undefined): boolean {
  return nexusGrantRequired(code) || code === 'NEXUS_UNAVAILABLE';
}

export function classifyNexusProbe(input: {
  code?: string | null;
  responseCode?: number | null;
}): NexusAccessProbe {
  if (nexusGrantRequired(input.code)) return 'grant_required';
  if (input.code === 'NEXUS_UNAVAILABLE') return 'degraded';
  if (input.responseCode === 401 || input.responseCode === 503) return 'degraded';
  return 'granted';
}

/**
 * The fallback is for an outage, never for a consent problem: a missing grant
 * must show the sign-in panel, not a different product.
 */
export function fallbackSelected(probe: NexusAccessProbe): boolean {
  return probe === 'degraded';
}

/** The minimal client shape a browser probe needs. */
export type NexusProbeClient = {
  send: (
    command: string,
    payload?: Record<string, unknown>,
  ) => Promise<{ ok?: boolean; responseCode?: number; code?: string; data?: unknown } | unknown>;
};

/**
 * One cheap read that separates a missing grant from an outage.
 *
 * Browser-side: the host passes its `CommandClient`. The server-side equivalent
 * is `NexusSessionManager.probe(sessionId)`.
 */
export async function probeNexusAvailability(client: NexusProbeClient): Promise<NexusAccessProbe> {
  try {
    const result = (await client.send('anx.communicate.conversations.list', {
      limit: 1,
      status: 'active',
    })) as { responseCode?: number; code?: string } | null;
    return classifyNexusProbe({
      code: typeof result?.code === 'string' ? result.code : null,
      responseCode: result?.responseCode ?? null,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (nexusGrantRequired(code)) return 'grant_required';
    return 'degraded';
  }
}

/** User-facing copy for a command failure. The code stays machine-readable. */
export function nexusErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'NO_NEXUS_GRANT':
      return 'Sign in with Nexus to continue.';
    case 'NEEDS_NEXUS_LOGIN':
    case 'NEEDS_RELOGIN':
      return 'Sign in with Nexus again to continue.';
    case 'NEXUS_UNAVAILABLE':
      return 'Nexus could not be reached. Try again shortly.';
    case 'NOT_CONFIGURED':
      return 'Nexus is not configured on this server.';
    case 'APP_AGENT_NOT_CONFIGURED':
      return 'The app agent is not configured yet.';
    case 'COMMAND_NOT_ALLOWED':
      return 'This action is not available here.';
    case 'RATE_LIMITED':
      return 'Too many requests. Wait a moment and try again.';
    default:
      return code || 'Something went wrong.';
  }
}
