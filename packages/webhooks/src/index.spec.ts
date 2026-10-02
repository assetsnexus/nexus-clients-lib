import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { dispatchWebhookEvent, isNewerVersion, verifySignature, type NexusWebhookPayload } from './index.js';

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

describe('dispatchWebhookEvent', () => {
  it('routes regulatory status and applies roles only when the version is newer', async () => {
    const seen: string[] = [];
    let rolesVersion = 2;
    const regulatory: NexusWebhookPayload = {
      eventId: 'e-reg',
      event: 'regulatory.status_changed',
      eventVersion: 1,
      clientId: 'client-1',
      at: '2026-10-02T12:00:00.000Z',
      data: {
        grantId: 'g1',
        clientId: 'client-1',
        sub: 'pairwise',
        subjectType: 'org_member',
        bundleSlug: 'kyb-l1',
        target: 'org',
        status: 'revoked',
        previousStatus: 'verified',
      },
    };
    await dispatchWebhookEvent(regulatory, {
      'regulatory.status_changed': (payload) => {
        seen.push(payload.data.status);
      },
    });
    expect(seen).toEqual(['revoked']);

    const roles = (version: number): NexusWebhookPayload => ({
      eventId: `e-roles-${version}`,
      event: 'app_roles.changed',
      eventVersion: 1,
      clientId: 'client-1',
      at: '2026-10-02T12:00:00.000Z',
      data: { sub: 'pairwise', grantId: 'g1', roles: ['admin'], rolesVersion: version },
    });
    let applied = 0;
    const onRoles = async (payload: Extract<NexusWebhookPayload, { event: 'app_roles.changed' }>) => {
      if (!isNewerVersion(rolesVersion, payload.data.rolesVersion)) return;
      rolesVersion = payload.data.rolesVersion;
      applied += 1;
    };
    await dispatchWebhookEvent(roles(2), { 'app_roles.changed': onRoles });
    await dispatchWebhookEvent(roles(3), { 'app_roles.changed': onRoles });
    expect(applied).toBe(1);
    expect(rolesVersion).toBe(3);
  });
});
