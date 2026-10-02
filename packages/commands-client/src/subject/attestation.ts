import { ID_TOKEN_CLOCK_SKEW_SECONDS } from '../oauth/helpers.js';
import { NexusError } from '../errors/nexus-error.js';
import type { RegulatoryAttestationClaims, RegulatoryStatusRow } from './types.js';

export type AttestationLogger = {
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

export type JwksKeySource = {
  getKey(kid?: string): Promise<Record<string, unknown> | null>;
};

const STATUSES = new Set(['verified', 'pending', 'rejected', 'expired', 'revoked', 'none']);
const KINDS = new Set(['kyc', 'kyb', 'age', 'identity']);

function b64urlToBytes(segment: string): Uint8Array {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function decodeJson(segment: string): Record<string, unknown> {
  const bytes = b64urlToBytes(segment);
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('segment is not an object');
  }
  return parsed as Record<string, unknown>;
}

function issuerEqual(left: string, right: string): boolean {
  return left.replace(/\/+$/, '') === right.replace(/\/+$/, '');
}

function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected;
  if (Array.isArray(aud)) return aud.some((item) => item === expected);
  return false;
}

function readStatuses(value: unknown): RegulatoryStatusRow[] {
  if (!Array.isArray(value)) {
    throw new Error('statuses missing');
  }
  return value.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('status row invalid');
    const item = row as Record<string, unknown>;
    const bundleSlug = typeof item.bundleSlug === 'string' ? item.bundleSlug : '';
    const kind = typeof item.kind === 'string' ? item.kind : '';
    const target = item.target === 'org' || item.target === 'user' ? item.target : '';
    const status = typeof item.status === 'string' ? item.status : '';
    if (!bundleSlug || !KINDS.has(kind) || !target || !STATUSES.has(status)) {
      throw new Error('status row invalid');
    }
    return {
      bundleSlug,
      kind: kind as RegulatoryStatusRow['kind'],
      target,
      status: status as RegulatoryStatusRow['status'],
      ...(typeof item.verifiedAt === 'string' ? { verifiedAt: item.verifiedAt } : {}),
      ...(typeof item.expiresAt === 'string' ? { expiresAt: item.expiresAt } : {}),
    };
  });
}

function fail(message: string, logger?: AttestationLogger, meta?: Record<string, unknown>): never {
  logger?.warn?.(message, meta);
  throw new NexusError('ATTESTATION_INVALID', message, { meta });
}

/**
 * Verify an RS256 regulatory attestation.
 * `aud` must be the calling client id. HS256 and missing `kid` are rejected.
 * The token itself is never logged.
 */
export async function verifyAttestation(opts: {
  attestation: string;
  issuer: string;
  audience: string;
  jwks: JwksKeySource;
  nowMs?: number;
  clockSkewSeconds?: number;
  logger?: AttestationLogger;
}): Promise<RegulatoryAttestationClaims> {
  const token = typeof opts.attestation === 'string' ? opts.attestation.trim() : '';
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    fail('attestation is not a compact JWS', opts.logger);
  }
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    fail('attestation segments are not JSON', opts.logger);
  }
  if (header.alg !== 'RS256') {
    fail('attestation alg must be RS256', opts.logger, { alg: String(header.alg || '') });
  }
  const kid = typeof header.kid === 'string' ? header.kid : '';
  if (!kid) fail('attestation kid is required', opts.logger);

  const key = await opts.jwks.getKey(kid);
  if (!key || key.kty !== 'RSA') {
    fail('attestation signing key was not found', opts.logger, { kid });
  }

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = b64urlToBytes(parts[2]);
  let verified = false;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      toArrayBuffer(signature),
      toArrayBuffer(signed),
    );
  } catch {
    fail('attestation key could not be imported', opts.logger, { kid });
  }
  if (!verified) fail('attestation signature mismatch', opts.logger, { kid });

  const skew = opts.clockSkewSeconds ?? ID_TOKEN_CLOCK_SKEW_SECONDS;
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const exp = payload.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    fail('attestation exp is required', opts.logger);
  }
  if (nowSec > exp + skew) {
    fail('attestation is expired', opts.logger, { exp });
  }
  if (typeof payload.nbf === 'number' && nowSec + skew < payload.nbf) {
    fail('attestation is not yet valid', opts.logger);
  }
  if (payload.typ !== 'anx-regulatory-status') {
    fail('attestation typ is not anx-regulatory-status', opts.logger);
  }
  if (typeof payload.iss !== 'string' || !issuerEqual(payload.iss, opts.issuer)) {
    fail('attestation issuer mismatch', opts.logger);
  }
  if (!audienceMatches(payload.aud, opts.audience)) {
    fail('attestation audience mismatch', opts.logger);
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    fail('attestation sub is required', opts.logger);
  }
  if (payload.subjectType !== 'user' && payload.subjectType !== 'org_member') {
    fail('attestation subjectType is invalid', opts.logger);
  }
  if (typeof payload.grantId !== 'string' || !payload.grantId) {
    fail('attestation grantId is required', opts.logger);
  }

  let statuses: RegulatoryStatusRow[];
  try {
    statuses = readStatuses(payload.statuses);
  } catch {
    fail('attestation statuses are invalid', opts.logger);
  }

  return {
    iss: payload.iss,
    aud: payload.aud as string | string[],
    sub: payload.sub,
    typ: 'anx-regulatory-status',
    grantId: payload.grantId,
    subjectType: payload.subjectType,
    statuses,
    exp,
    ...(typeof payload.iat === 'number' ? { iat: payload.iat } : {}),
  };
}
