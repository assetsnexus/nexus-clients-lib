import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  createIdempotencyStore,
  dispatchWebhookEvent,
  expressAdapter,
  isAppRolesChanged,
  isNewerVersion,
  verifySignature,
  type NexusWebhookPayload,
} from './index.js';

function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown };
  return Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return { json: (b: unknown) => { res.body = b; } };
    },
  });
}

describe('expressAdapter', () => {
  const secret = 'whsec_adapter';
  const raw = JSON.stringify({
    eventId: 'e-a',
    event: 'grant.revoked',
    eventVersion: 1,
    clientId: 'c',
    at: '2026-10-02T12:00:00.000Z',
    data: { grantId: 'g', clientId: 'c', sub: 's', reason: 'user_revoked' },
  });
  const t = Math.floor(Date.now() / 1000);
  const header = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
  const req = () => ({ rawBody: Buffer.from(raw), headers: { 'x-nexus-signature': header } });

  it('returns 500 on handler failure and processes the retry', async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const handler = expressAdapter({
      secret,
      handlers: {
        'grant.revoked': () => {
          calls += 1;
          if (calls === 1) throw new Error('db down');
        },
      },
      onError: (e) => errors.push(e),
    });
    const first = fakeRes();
    await handler(req(), first);
    expect(first.statusCode).toBe(500);
    expect(errors).toHaveLength(1);
    const second = fakeRes();
    await handler(req(), second);
    expect(second.body).toEqual({ ok: true });
    const third = fakeRes();
    await handler(req(), third);
    expect(third.body).toEqual({ ok: true, duplicate: true });
    expect(calls).toBe(2);
  });

  it('parses the verified raw body, not req.body', async () => {
    let sub = '';
    const handler = expressAdapter({
      secret,
      handlers: { 'grant.revoked': (p) => { sub = p.data.sub; } },
    });
    const res = fakeRes();
    await handler({ ...req(), body: { eventId: 'x', event: 'grant.revoked', data: { sub: 'tampered' } } }, res);
    expect(res.statusCode).toBe(200);
    expect(sub).toBe('s');
  });

  it('bounds the in-process store', () => {
    const store = createIdempotencyStore({ maxEntries: 2 });
    store.add('a');
    store.add('b');
    store.add('c');
    expect(store.has('a')).toBe(false);
    expect(store.has('c')).toBe(true);
  });
});

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
  it('routes regulatory status and account.erased', async () => {
    const seen: string[] = [];
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

    const erased: NexusWebhookPayload = {
      eventId: 'e-erased',
      event: 'account.erased',
      eventVersion: 1,
      clientId: 'client-1',
      at: '2026-10-02T12:00:00.000Z',
      data: {
        clientId: 'client-1',
        grantIds: ['g1'],
        subs: ['pairwise-sub'],
        reason: 'user_erasure',
      },
    };
    let erasedSubs: string[] = [];
    await dispatchWebhookEvent(erased, {
      'account.erased': (payload) => {
        erasedSubs = payload.data.subs;
        expect(payload.data).not.toHaveProperty('userId');
      },
    });
    expect(erasedSubs).toEqual(['pairwise-sub']);
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
        sub: 'pairwise-sub',
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

  it('accepts a newer app role version and ignores a stale one', () => {
    const payload: NexusWebhookPayload = {
      eventId: 'e-roles',
      event: 'app_roles.changed',
      eventVersion: 1,
      clientId: 'client-1',
      at: '2026-10-05T12:00:00.000Z',
      data: {
        grantId: 'g1',
        clientId: 'client-1',
        sub: 'pairwise-sub',
        app_roles: ['app_admin'],
        app_roles_v: 2,
      },
    };
    expect(isAppRolesChanged(payload)).toBe(true);
    expect(JSON.stringify(payload.data)).not.toContain('userId');
    expect(isNewerVersion(1, 2)).toBe(true);
    expect(isNewerVersion(2, 2)).toBe(false);
    expect(isNewerVersion(undefined, 1)).toBe(true);
  });
});
