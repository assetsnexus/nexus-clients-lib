import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { NexusWebhookPayload } from '@nexus/webhooks';
import { createPrivacyKit } from './kit.js';
import { createMemoryPrivacyJobStore } from './memory-store.js';
import { assertSectionCoverage, createSectionRegistry } from './sections.js';
import type { PrivacyCommandClient, PrivacyRequestType } from './types.js';

function client(): PrivacyCommandClient & {
  calls: string[];
  uploads: Array<{ requestId: string; sha256: string; contentLength: number }>;
} {
  const calls: string[] = [];
  const uploads: Array<{ requestId: string; sha256: string; contentLength: number }> = [];
  return {
    calls,
    uploads,
    privacyRequests: {
      async list() {
        calls.push('list');
        return { items: [] };
      },
      async acknowledge(requestId) {
        calls.push(`ack:${requestId}`);
        return {};
      },
      async exportUploadUrl(input) {
        calls.push(`upload-url:${input.requestId}`);
        uploads.push(input);
        return { uploadUrl: `https://files.example/${input.requestId}`, headers: { 'x-amz-server-side-encryption': 'AES256' } };
      },
      async complete(input) {
        calls.push(`complete:${input.requestId}:${input.outcome}`);
        return {};
      },
    },
  };
}

function created(type: PrivacyRequestType, requestId = 'req-1'): NexusWebhookPayload {
  return {
    eventId: `evt-${requestId}`,
    event: 'privacy_request.created',
    eventVersion: 1,
    clientId: 'client-a',
    at: '2026-10-05T12:00:00.000Z',
    data: { requestId, type, sub: 'pairwise-sub', grantId: 'grant-1', dueAt: '2026-11-05T12:00:00.000Z' },
  };
}

describe('privacy kit', () => {
  it('is idempotent for the same request and fulfils access with a checked upload', async () => {
    const api = client();
    const sections = createSectionRegistry();
    sections.register({ id: 'profile', export: () => ({ email: 'a@example.com' }), erase: () => ({ deleted: 0, anonymised: 0, retained: [] }) });
    const puts: Array<{ url: string; headers: Record<string, string>; length: number }> = [];
    const kit = createPrivacyKit({
      client: api,
      store: createMemoryPrivacyJobStore(),
      sections,
      putExport: async (url, body, headers) => {
        const expected = api.uploads[0];
        expect(body.byteLength).toBe(expected.contentLength);
        expect(createHash('sha256').update(body).digest('hex')).toBe(expected.sha256);
        expect(headers['x-amz-server-side-encryption']).toBe('AES256');
        puts.push({ url, headers, length: body.byteLength });
        return { status: 200 };
      },
    });
    expect(await kit.handleEvent(created('access'))).toBe('inserted');
    expect(await kit.handleEvent(created('access'))).toBe('exists');
    const first = await kit.tick();
    expect(first).toEqual({ processed: 1, failed: 0 });
    expect(api.calls).toEqual(['ack:req-1', 'upload-url:req-1', 'complete:req-1:fulfilled']);
    expect(puts).toHaveLength(1);
    const second = await kit.tick();
    expect(second.processed).toBe(0);
  });

  it('runs erasure and completes with retained categories', async () => {
    const api = client();
    const sections = createSectionRegistry();
    sections.register({
      id: 'sessions',
      erase: () => ({ deleted: 2, anonymised: 1, retained: [{ category: 'security_log', legalBasis: 'legitimate_interest' }] }),
    });
    const kit = createPrivacyKit({ client: api, store: createMemoryPrivacyJobStore(), sections });
    await kit.handleEvent(created('erasure'));
    await kit.tick();
    expect(api.calls).toEqual(['ack:req-1', 'complete:req-1:fulfilled']);
  });

  it('holds review types until completeReview', async () => {
    const api = client();
    const sections = createSectionRegistry();
    let reviewed = 0;
    const kit = createPrivacyKit({
      client: api,
      store: createMemoryPrivacyJobStore(),
      sections,
      onReview: () => { reviewed += 1; },
    });
    await kit.handleEvent(created('objection', 'req-o'));
    await kit.tick();
    expect(reviewed).toBe(1);
    expect(api.calls).toEqual(['ack:req-o']);
    await kit.tick();
    expect(api.calls).toEqual(['ack:req-o']);
    await kit.completeReview('req-o', { outcome: 'rejected', rejectionReason: 'contract', legalBasis: 'art_6_1_b' });
    await kit.tick();
    expect(api.calls).toContain('complete:req-o:rejected');
  });

  it('does not fulfil a request cancelled before the worker runs', async () => {
    const api = client();
    const kit = createPrivacyKit({
      client: api,
      store: createMemoryPrivacyJobStore(),
      sections: createSectionRegistry(),
    });
    await kit.handleEvent(created('access'));
    await kit.handleEvent({
      eventId: 'evt-cancel',
      event: 'privacy_request.cancelled',
      eventVersion: 1,
      clientId: 'client-a',
      at: '2026-10-05T12:01:00.000Z',
      data: { requestId: 'req-1', type: 'access', sub: 'pairwise-sub', grantId: 'grant-1', reason: 'subject' },
    });
    await kit.tick();
    expect(api.calls).toEqual([]);
  });

  it('erases local sections on account.erased once per event', async () => {
    const api = client();
    const erased: string[] = [];
    const sections = createSectionRegistry();
    sections.register({
      id: 'profile',
      erase: (ctx) => {
        erased.push(ctx.sub);
        return { deleted: 1, anonymised: 0, retained: [] };
      },
    });
    const kit = createPrivacyKit({ client: api, store: createMemoryPrivacyJobStore(), sections });
    const event: NexusWebhookPayload = {
      eventId: 'evt-erased',
      event: 'account.erased',
      eventVersion: 1,
      clientId: 'client-a',
      at: '2026-10-05T12:00:00.000Z',
      data: { clientId: 'client-a', grantIds: ['g1'], subs: ['pairwise-sub'], reason: 'user_erasure' },
    };
    expect(await kit.handleEvent(event)).toBe('inserted');
    expect(await kit.handleEvent(event)).toBe('exists');
    await kit.tick();
    expect(erased).toEqual(['pairwise-sub']);
    expect(api.calls).toEqual([]);
  });

  it('reconcile enqueues an open request the webhook missed', async () => {
    const api = client();
    api.privacyRequests.list = async () => ({
      items: [{ requestId: 'missed', type: 'access', sub: 'pairwise-sub', grantId: 'g1', dueAt: '2026-11-05T00:00:00.000Z' }],
    });
    const kit = createPrivacyKit({ client: api, store: createMemoryPrivacyJobStore(), sections: createSectionRegistry() });
    expect(await kit.reconcile()).toEqual({ enqueued: 1 });
    expect(await kit.reconcile()).toEqual({ enqueued: 0 });
  });

  it('retries a failed upload with backoff', async () => {
    const api = client();
    const kit = createPrivacyKit({
      client: api,
      store: createMemoryPrivacyJobStore(),
      sections: createSectionRegistry(),
      putExport: async () => ({ status: 500 }),
      now: () => new Date('2026-10-05T12:00:00.000Z'),
    });
    await kit.handleEvent(created('access'));
    const result = await kit.tick();
    expect(result.failed).toBe(1);
    const again = await kit.tick();
    expect(again.processed + again.failed).toBe(0);
  });

  it('rejects a coverage gap', () => {
    expect(() => assertSectionCoverage(['authSessions'], ['authSessions', 'oauthTransactions'])).toThrow(/missing=oauthTransactions/);
  });
});
