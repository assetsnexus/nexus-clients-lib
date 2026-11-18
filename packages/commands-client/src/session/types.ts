/**
 * Server-side Nexus session types.
 *
 * The host owns persistence: pass any store (memory, file, Postgres, Redis).
 * The manager never assumes a single session, a single org, or a single
 * identity — a session can hold a personal identity and several org
 * memberships, and switching between them is a new authorize.
 */
import type { NexusEventBus } from './events.js';

export type NexusSubjectType = 'user' | 'org_member';

/** What a pending login needs to finish. Never persisted outside the store. */
export type NexusLoginIntent = {
  state: string;
  codeVerifier: string;
  subjectType: NexusSubjectType;
  orgId?: string;
  /** Same-origin path to land on after the callback. */
  returnTo?: string;
};

/**
 * One session, as the store holds it.
 *
 * `accessToken` is optional because a restored session starts with only the
 * refresh token; the manager mints an access token on demand.
 */
export type NexusSessionRecord = {
  id: string;
  accessToken?: string;
  refreshToken?: string;
  subjectType?: NexusSubjectType;
  orgId?: string;
  intent?: NexusLoginIntent;
  /** Unix milliseconds, derived from the access token's `exp` when known. */
  accessExpiresAt?: number;
};

/**
 * The persistence port. Every method may be sync or async, so an in-memory map
 * and a database repository are both valid implementations.
 */
export type NexusSessionStore = {
  get(id: string): NexusSessionRecord | undefined | Promise<NexusSessionRecord | undefined>;
  set(record: NexusSessionRecord): void | Promise<void>;
  delete(id: string): void | Promise<void>;
  /** Optional. Used by boot-time work that has no session id yet. */
  list?(): NexusSessionRecord[] | Promise<NexusSessionRecord[]>;
};

/**
 * What the region actually granted, not what the app wishes for.
 *
 * - `anonymous` — no session.
 * - `user` — a personal (`subject_type=user`) grant.
 * - `tenant` — an `org_member` grant. The app token does not carry the member's
 *   Nexus role, so this means "member of a tenant", never "tenant admin".
 * - `app_admin` — the token carries `app_roles: ['app_admin']`.
 */
export type NexusIdentityLevel = 'anonymous' | 'user' | 'tenant' | 'app_admin';

export type NexusSessionView = {
  signedIn: boolean;
  level: NexusIdentityLevel;
  subjectType: NexusSubjectType | null;
  orgId: string | null;
  appRoles: string[];
  appTenantOrg: string | null;
  /** Unix milliseconds, when the token said. */
  accessExpiresAt: number | null;
};

export type NexusTokenErrorCode =
  | 'NEXUS_UNAVAILABLE'
  | 'GRANT_REVOKED'
  | 'INVALID_GRANT'
  | 'CLIENT_AUTH_FAILED'
  | 'CLOCK_SKEW'
  | 'AUDIENCE_MISMATCH'
  | 'REFRESH_MISSING'
  | 'SESSION_NOT_FOUND'
  | 'UNKNOWN';

export type NexusTokenError = {
  code: NexusTokenErrorCode;
  message: string;
  /** What to check, in the order worth checking it. */
  hint: string;
};

export type NexusTokenResult =
  | { ok: true }
  | { ok: false; error: NexusTokenError };

/** One command result, shaped for a host that renders its own UI. */
export type NexusCommandOutcome = {
  ok: boolean;
  responseCode: number;
  data: unknown;
  errorCode?: string;
  message?: string;
};

/**
 * Three states, and they are not interchangeable.
 *
 * - `granted` — the grant works.
 * - `grant_required` — no grant, revoked, or the session expired. The answer is
 *   "sign in", not a fallback product.
 * - `degraded` — Nexus is unreachable or the token is unusable for a reason
 *   that is not consent. This is the only state that warrants a fallback.
 */
export type NexusAccessProbe = 'granted' | 'grant_required' | 'degraded';

export type NexusSessionLogger = {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

export type NexusSessionManagerOptions = {
  /** Optional bus to use instead of the manager's own. */
  events?: NexusEventBus;
  /** Region public REST origin (the OAuth2 issuer), not the portal. */
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /** Defaults to `openid`. */
  scope?: string;
  /** The host's persistence. */
  store: NexusSessionStore;
  fetchImpl?: typeof fetch;
  logger?: NexusSessionLogger;
  /** Clock, for tests. */
  now?: () => number;
  /** Session id factory, for tests. */
  newSessionId?: () => string;
};

/**
 * The whole Nexus session surface a host needs.
 *
 * Every method takes a session id, so a host with several users (or several
 * identities per user) keeps its own keying and passes it through.
 */
export type NexusSessionManager = {
  /** Starts a login and returns the authorize URL to redirect to. */
  startLogin(input: {
    subjectType: NexusSubjectType;
    orgId?: string;
    returnTo?: string;
  }): Promise<{ sessionId: string; authorizeUrl: string }>;
  /** Finishes the callback. Throws on a state mismatch or a rejected exchange. */
  completeLogin(input: {
    sessionId: string;
    code: string;
    state: string;
  }): Promise<{ sessionId: string; returnTo?: string }>;
  refresh(sessionId: string): Promise<NexusTokenResult>;
  revoke(sessionId: string): Promise<NexusTokenResult>;
  /** Sends a command with the session's token, refreshing once on a 401. */
  sendCommand(
    sessionId: string,
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<NexusCommandOutcome>;
  /** One cheap read that separates a missing grant from an outage. */
  probe(sessionId: string): Promise<NexusAccessProbe>;
  /** What the region actually granted, for rendering. */
  view(sessionId: string): Promise<NexusSessionView>;
  /** Consented identities (personal + org memberships). */
  identities(sessionId: string): Promise<unknown>;
  /** A different identity is a new authorize, not a local flag. */
  switchIdentity(
    sessionId: string,
    input: { subjectType: NexusSubjectType; orgId?: string; returnTo?: string },
  ): Promise<{ sessionId: string; authorizeUrl: string }>;
  /** Restores a persisted session by minting an access token from its refresh token. */
  restore(sessionId: string): Promise<NexusTokenResult>;
  /**
   * The raw access token, for host-side calls that need a `NexusClient` (field
   * claims, regulatory status, permission batches). Server-side only: never
   * send this to a browser.
   */
  accessToken(sessionId: string): Promise<string | null>;
  /**
   * Lifecycle events. Subscribe for analytics, UI hooks or your own `app.*`
   * events; no event carries a token or a message body.
   */
  events: NexusEventBus;
};
