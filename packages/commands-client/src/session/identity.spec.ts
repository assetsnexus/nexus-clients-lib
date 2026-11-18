import { describe, expect, it } from 'vitest';
import {
  accessExpiresAtFromClaims,
  buildSessionView,
  decodeAppTokenClaims,
  deriveIdentityLevel,
  safeReturnTo,
} from './identity.js';

function jwt(payload: Record<string, unknown>): string {
  const enc = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${enc({ alg: 'RS256' })}.${enc(payload)}.signature`;
}

describe('decodeAppTokenClaims', () => {
  it('reads the payload of a compact JWT', () => {
    expect(decodeAppTokenClaims(jwt({ subjectType: 'user', app_roles: ['app_admin'] }))).toMatchObject({
      subjectType: 'user',
      app_roles: ['app_admin'],
    });
  });

  it('returns null for a missing or malformed token', () => {
    expect(decodeAppTokenClaims(undefined)).toBeNull();
    expect(decodeAppTokenClaims(null)).toBeNull();
    expect(decodeAppTokenClaims('not-a-jwt')).toBeNull();
    expect(decodeAppTokenClaims('a.!!!.c')).toBeNull();
  });
});

describe('accessExpiresAtFromClaims', () => {
  it('converts exp seconds to milliseconds', () => {
    expect(accessExpiresAtFromClaims({ exp: 1_700_000_000 })).toBe(1_700_000_000_000);
  });

  it('is null without a numeric exp', () => {
    expect(accessExpiresAtFromClaims(null)).toBeNull();
    expect(accessExpiresAtFromClaims({})).toBeNull();
  });
});

describe('deriveIdentityLevel', () => {
  it('is anonymous without a session', () => {
    expect(deriveIdentityLevel({ signedIn: false, claims: null })).toBe('anonymous');
  });

  it('is user for a personal grant', () => {
    expect(deriveIdentityLevel({ signedIn: true, claims: { subjectType: 'user' } })).toBe('user');
  });

  it('is tenant for an org-member grant', () => {
    expect(deriveIdentityLevel({ signedIn: true, claims: { subjectType: 'org_member' } })).toBe('tenant');
  });

  it('is app_admin when the token carries the app role', () => {
    expect(
      deriveIdentityLevel({ signedIn: true, claims: { subjectType: 'user', app_roles: ['app_admin'] } }),
    ).toBe('app_admin');
  });
});

describe('buildSessionView', () => {
  it('prefers the token claims over the stored labels', () => {
    const view = buildSessionView({
      accessToken: jwt({ subjectType: 'org_member', orgId: 'org-from-token', exp: 1_700_000_000 }),
      subjectType: 'user',
      orgId: 'org-from-store',
    });
    expect(view).toMatchObject({
      signedIn: true,
      level: 'tenant',
      subjectType: 'org_member',
      orgId: 'org-from-token',
      accessExpiresAt: 1_700_000_000_000,
    });
  });

  it('falls back to the stored labels without a token', () => {
    const view = buildSessionView({ accessToken: null, subjectType: 'user', orgId: null });
    expect(view).toMatchObject({ signedIn: false, level: 'anonymous', subjectType: 'user' });
  });
});

describe('safeReturnTo', () => {
  it('accepts a same-origin path', () => {
    expect(safeReturnTo('/plants?bed=1')).toBe('/plants?bed=1');
  });

  it('rejects a scheme, a protocol-relative path, and traversal', () => {
    for (const value of ['https://evil.example', '//evil.example', '/a/../b', '/a\\b', '']) {
      expect(safeReturnTo(value)).toBeUndefined();
    }
  });
});
