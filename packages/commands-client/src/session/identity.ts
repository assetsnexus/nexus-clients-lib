/**
 * Identity helpers for an app token.
 *
 * The region puts only what the app is allowed to see into the token: a
 * pairwise `sub`, the subject type, and (when granted) the org and the app
 * roles. There is no platform user id, so the app must never try to derive one.
 */
import type { NexusIdentityLevel, NexusSessionView, NexusSubjectType } from './types.js';

export type NexusAppTokenClaims = {
  sub?: string;
  subjectType?: string;
  orgId?: string;
  membershipId?: string;
  app_roles?: string[];
  app_roles_v?: number;
  app_tenant_org?: string;
  scope?: string;
  /** Unix seconds. */
  exp?: number;
  [key: string]: unknown;
};

/**
 * Decodes a JWT payload without verifying it.
 *
 * Safe for display and for choosing which UI to render: the token came from the
 * token endpoint over TLS, and the region remains authoritative for every
 * authorization decision. Never use this to grant anything.
 */
/**
 * Base64url → UTF-8, without assuming Node's `Buffer`.
 *
 * The same module runs in a browser (the SPA reads the level) and on a server
 * (the BFF reads the org), so it cannot depend on a Node global.
 */
function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bufferCtor = (globalThis as { Buffer?: { from: (v: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
  if (bufferCtor) {
    try {
      return bufferCtor.from(padded, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  const atobFn = (globalThis as { atob?: (v: string) => string }).atob;
  if (!atobFn) return null;
  try {
    const binary = atobFn(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function decodeAppTokenClaims(token: string | undefined | null): NexusAppTokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as NexusAppTokenClaims) : null;
  } catch {
    return null;
  }
}

/** Unix milliseconds from the token's `exp`, or null when absent. */
export function accessExpiresAtFromClaims(claims: NexusAppTokenClaims | null): number | null {
  const exp = claims?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

export function deriveIdentityLevel(input: {
  signedIn: boolean;
  claims: NexusAppTokenClaims | null;
}): NexusIdentityLevel {
  if (!input.signedIn) return 'anonymous';
  const roles = Array.isArray(input.claims?.app_roles) ? input.claims?.app_roles : [];
  if (roles.includes('app_admin')) return 'app_admin';
  if (input.claims?.subjectType === 'org_member') return 'tenant';
  return 'user';
}

/** The view a host renders. Pure, so it is testable without a store. */
export function buildSessionView(input: {
  accessToken?: string | null;
  subjectType?: NexusSubjectType | null;
  orgId?: string | null;
}): NexusSessionView {
  const claims = decodeAppTokenClaims(input.accessToken);
  const signedIn = Boolean(input.accessToken);
  const subjectType =
    (claims?.subjectType as NexusSubjectType | undefined) || input.subjectType || null;
  // A token that is not a decodable JWT (a test double, or an opaque token from
  // a future issuer) still has the stored subject type, so the level must not
  // silently fall back to `user`.
  const effectiveClaims = claims ?? (subjectType ? { subjectType } : null);
  return {
    signedIn,
    level: deriveIdentityLevel({ signedIn, claims: effectiveClaims }),
    subjectType,
    orgId: (claims?.orgId as string | undefined) || input.orgId || null,
    appRoles: Array.isArray(claims?.app_roles) ? claims.app_roles : [],
    appTenantOrg: (claims?.app_tenant_org as string | undefined) || null,
    accessExpiresAt: accessExpiresAtFromClaims(claims),
  };
}

/**
 * A post-login landing path: same-origin, absolute path, no scheme, no `..`.
 * Anything else is dropped so a callback cannot become an open redirect.
 */
export function safeReturnTo(value: string | undefined | null): string | undefined {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 512) return undefined;
  if (!raw.startsWith('/') || raw.startsWith('//')) return undefined;
  if (raw.includes('\\') || raw.includes('://') || raw.includes('\0') || raw.includes('..')) {
    return undefined;
  }
  return raw;
}
