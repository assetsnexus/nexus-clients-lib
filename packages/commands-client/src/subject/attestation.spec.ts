import { createSign, generateKeyPairSync } from 'crypto';
import { describe, expect, it } from 'vitest';
import { NexusError } from '../errors/nexus-error.js';
import { verifyAttestation } from './attestation.js';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signAttestation(input: {
  claims: Record<string, unknown>;
  kid?: string;
  alg?: string;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}): string {
  const header = b64url(
    Buffer.from(JSON.stringify({ alg: input.alg || 'RS256', kid: input.kid || 'kid-1', typ: 'JWT' })),
  );
  const payload = b64url(Buffer.from(JSON.stringify(input.claims)));
  const data = `${header}.${payload}`;
  const sig = createSign('RSA-SHA256').update(data).end().sign(input.privateKey);
  return `${data}.${b64url(sig)}`;
}

describe('verifyAttestation', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  jwk.kid = 'kid-1';
  jwk.alg = 'RS256';
  const jwks = { getKey: async (kid?: string) => (kid === 'kid-1' ? jwk : null) };
  const nowMs = Date.parse('2026-10-02T12:00:00.000Z');
  const claims = {
    iss: 'https://region.example',
    aud: 'client-1',
    sub: 'pairwise-1',
    typ: 'anx-regulatory-status',
    grantId: 'grant-1',
    subjectType: 'org_member',
    statuses: [{ bundleSlug: 'kyb-l1', kind: 'kyb', target: 'org', status: 'verified' }],
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + 300,
  };

  it('accepts an RS256 attestation for the client audience', async () => {
    const token = signAttestation({ claims, privateKey });
    const verified = await verifyAttestation({
      attestation: token,
      issuer: 'https://region.example/',
      audience: 'client-1',
      jwks,
      nowMs,
    });
    expect(verified.grantId).toBe('grant-1');
    expect(verified.subjectType).toBe('org_member');
    expect(verified.statuses[0]?.status).toBe('verified');
  });

  it('rejects HS256, the wrong audience, and an expired token', async () => {
    const hs = signAttestation({ claims, privateKey, alg: 'HS256' });
    await expect(
      verifyAttestation({ attestation: hs, issuer: claims.iss, audience: 'client-1', jwks, nowMs }),
    ).rejects.toBeInstanceOf(NexusError);

    const other = signAttestation({ claims: { ...claims, aud: 'other' }, privateKey });
    await expect(
      verifyAttestation({ attestation: other, issuer: claims.iss, audience: 'client-1', jwks, nowMs }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_INVALID' });

    const expired = signAttestation({
      claims: { ...claims, exp: Math.floor(nowMs / 1000) - 120 },
      privateKey,
    });
    await expect(
      verifyAttestation({ attestation: expired, issuer: claims.iss, audience: 'client-1', jwks, nowMs }),
    ).rejects.toMatchObject({ message: 'attestation is expired' });
  });
});
