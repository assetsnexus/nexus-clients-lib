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
  it('routes regulatory status and applies account.erased only when the version is newer', async () => {
    const seen: string[] = [];
    let seenVersion = 2;
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

    const erased = (version: number): NexusWebhookPayload => ({
      eventId: `e-erased-${version}`,
      event: 'account.erased',
      eventVersion: version,
      clientId: 'client-1',
      at: '2026-10-02T12:00:00.000Z',
      data: {
        clientId: 'client-1',
        grantIds: ['g1'],
        subs: ['pairwise-sub'],
        reason: 'user_erasure',
      },
    });
    let applied = 0;
    const onErased = async (payload: Extract<NexusWebhookPayload, { event: 'account.erased' }>) => {
      if (!isNewerVersion(seenVersion, payload.eventVersion)) return;
      seenVersion = payload.eventVersion;
      applied += 1;
      expect(payload.data).not.toHaveProperty('userId');
    };
    await dispatchWebhookEvent(erased(2), { 'account.erased': onErased });
    await dispatchWebhookEvent(erased(3), { 'account.erased': onErased });
    expect(applied).toBe(1);
    expect(seenVersion).toBe(3);
  });

  it('routes notification.action with its typed payload', async () => {
    const payload: NexusWebhookPayload = {
      eventId: 'e-action',
      event: 'notification.action',
      eventVersion: 1,
      clientId: 'client-1',
      at: '2026-10-02T12:00:00.000Z',
      data: {
        notificationId: 'n1',
        actionId: 'ack',
        subject: 'pairwise-sub',
        occurredAt: '2026-10-02T12:00:01.000Z',
      },
    };
    let seen = '';
    await dispatchWebhookEvent(payload, {
      'notification.action': (event) => {
        seen = `${event.data.notificationId}:${event.data.actionId}:${event.data.subject}:${event.data.occurredAt}`;
      },
    });
    expect(seen).toBe('n1:ack:pairwise-sub:2026-10-02T12:00:01.000Z');
  });
});
