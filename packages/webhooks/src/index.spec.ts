import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifySignature } from './index.js';

describe('verifySignature', () => {
  const secret = 'whsec_test_aaaaaaaa';
  const body = JSON.stringify({ eventId: 'e1', event: 'grant.revoked', data: {} });

  function sign(raw: string, s: string, t = Math.floor(Date.now() / 1000)) {
    const v1 = createHmac('sha256', s).update(`${t}.${raw}`).digest('hex');
    return `t=${t},v1=${v1}`;
  }

  it('verifies a valid signature', () => {
    const header = sign(body, secret);
    expect(verifySignature(body, { 'x-nexus-signature': header }, secret)).toBe(true);
  });

  it('accepts either secret during rotation (dual v1)', () => {
    const t = Math.floor(Date.now() / 1000);
    const a = sign(body, secret, t);
    const b = sign(body, 'whsec_old_bbbbbbbb', t).replace(/^t=\d+,/, '');
    const header = `${a},${b}`;
    expect(verifySignature(body, { 'X-Nexus-Signature': header }, [secret, 'whsec_old_bbbbbbbb'])).toBe(
      true,
    );
  });

  it('fails closed on missing raw body or header', () => {
    expect(verifySignature('', { 'x-nexus-signature': sign(body, secret) }, secret)).toBe(false);
    expect(verifySignature(body, {}, secret)).toBe(false);
  });
});
