import { createHash, randomUUID } from 'node:crypto';
import type { NexusWebhookPayload } from '@nexus/webhooks';
import type {
  EraseResult,
  PrivacyJob,
  PrivacyKitOptions,
  PrivacyRequestType,
  PrivacyReviewOutcome,
  PrivacySectionContext,
  RetainedCategory,
} from './types.js';

const REVIEW_TYPES = new Set<PrivacyRequestType>(['rectification', 'restriction', 'objection']);

function backoffMs(attempts: number): number {
  return Math.min(30_000 * Math.max(attempts, 1), 15 * 60_000);
}

async function defaultPut(url: string, body: Uint8Array, headers: Record<string, string>): Promise<{ status: number }> {
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  const response = await fetch(url, { method: 'PUT', headers, body: bytes });
  return { status: response.status };
}

/**
 * Headers for the presigned PUT. Names are lower-cased so a region `Content-Type`
 * replaces the default instead of `fetch` joining both into one signed value.
 */
export function uploadHeaders(contentType: string, fromRegion: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': contentType };
  for (const [name, value] of Object.entries(fromRegion)) headers[name.toLowerCase()] = value;
  return headers;
}

export function createPrivacyKit(options: PrivacyKitOptions) {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? 60_000;
  const owner = `privacy-${randomUUID()}`;
  const putExport = options.putExport ?? defaultPut;
  const log = options.logger ?? {};
  const metrics = options.metrics ?? {};

  function stamp(job: PrivacyJob, patch: Partial<PrivacyJob>): PrivacyJob {
    return { ...job, ...patch, updatedAt: now().toISOString() };
  }

  async function handleEvent(envelope: NexusWebhookPayload): Promise<'inserted' | 'exists' | 'ignored'> {
    if (envelope.event === 'privacy_request.cancelled') {
      const cancelled = await options.store.cancel(envelope.data.requestId, now().toISOString());
      if (cancelled) return 'exists';
      const job = jobFromCreatedLike(envelope.eventId, envelope.data, 'cancelled', now().toISOString());
      return options.store.enqueue(job);
    }
    if (envelope.event === 'privacy_request.created') {
      const existing = await options.store.get(envelope.data.requestId);
      if (existing) return 'exists';
      return options.store.enqueue(jobFromCreatedLike(envelope.eventId, envelope.data, 'queued', now().toISOString()));
    }
    if (envelope.event === 'account.erased') {
      const existing = await options.store.get(envelope.eventId);
      if (existing) return 'exists';
      const at = now().toISOString();
      return options.store.enqueue({
        requestId: envelope.eventId,
        eventId: envelope.eventId,
        kind: 'account.erased',
        type: 'account_erased',
        sub: envelope.data.subs[0] || '',
        grantId: envelope.data.grantIds[0] || '',
        grantIds: envelope.data.grantIds,
        subs: envelope.data.subs,
        status: 'queued',
        attempts: 0,
        nextAttemptAt: at,
        updatedAt: at,
      });
    }
    return 'ignored';
  }

  async function tick(limit = 10): Promise<{ processed: number; failed: number }> {
    const jobs = await options.store.lease(now().toISOString(), owner, leaseMs, limit);
    let processed = 0;
    let failed = 0;
    for (const job of jobs) {
      const started = Date.now();
      try {
        await processJob(job);
        processed += 1;
        metrics.counter?.('nexus_privacy_jobs_total', { type: job.type, result: 'ok' }, 1);
        metrics.histogram?.('nexus_privacy_job_seconds', { type: job.type }, (Date.now() - started) / 1000);
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        const attempts = job.attempts + 1;
        await options.store.save(stamp(job, {
          attempts,
          lastError: message,
          nextAttemptAt: new Date(now().getTime() + backoffMs(attempts)).toISOString(),
          leaseOwner: job.leaseOwner,
        }));
        log.error?.('privacy job failed', { requestId: job.requestId, type: job.type, message });
        metrics.counter?.('nexus_privacy_jobs_total', { type: job.type, result: 'error' }, 1);
      }
    }
    return { processed, failed };
  }

  async function processJob(job: PrivacyJob): Promise<void> {
    const fresh = await options.store.get(job.requestId);
    if (fresh?.status === 'cancelled') {
      await options.store.save(stamp(job, { status: 'cancelled', leaseOwner: job.leaseOwner }));
      return;
    }
    if (job.status === 'cancelled' || job.kind === 'privacy_request.cancelled') {
      await options.store.save(stamp(job, { status: 'cancelled', leaseOwner: job.leaseOwner }));
      return;
    }
    if (job.kind === 'account.erased') {
      const subs = job.subs?.length ? job.subs : [job.sub];
      const grantIds = job.grantIds?.length ? job.grantIds : [job.grantId];
      const pairs = subs.length === grantIds.length
        ? subs.map((sub, index) => ({ sub, grantId: grantIds[index] }))
        : subs.flatMap((sub) => grantIds.map((grantId) => ({ sub, grantId })));
      for (const pair of pairs) {
        await eraseSections({ requestId: job.requestId, sub: pair.sub, grantId: pair.grantId, type: 'account_erased' });
      }
      await options.store.save(stamp(job, { status: 'completed', leaseOwner: job.leaseOwner }));
      log.info?.('account erased locally', { eventId: job.eventId, subs: pairs.length });
      return;
    }
    if (job.status === 'review') {
      if (!job.review) return;
      if (!job.acknowledged) {
        await options.client.privacyRequests.acknowledge(job.requestId);
        job.acknowledged = true;
      }
      await finishReview(job, job.review);
      return;
    }
    if (!job.acknowledged) {
      await options.client.privacyRequests.acknowledge(job.requestId);
      job.acknowledged = true;
    }
    if (job.type === 'access') {
      await fulfillAccess(job);
      return;
    }
    if (job.type === 'erasure') {
      await fulfillErasure(job);
      return;
    }
    if (REVIEW_TYPES.has(job.type as PrivacyRequestType)) {
      await options.onReview?.(job);
      await options.store.save(stamp(job, { status: 'review', acknowledged: true, leaseOwner: job.leaseOwner }));
      log.info?.('privacy request waiting for review', { requestId: job.requestId, type: job.type });
      return;
    }
    throw new Error(`unsupported privacy job type ${job.type}`);
  }

  async function fulfillAccess(job: PrivacyJob): Promise<void> {
    const sections: Record<string, unknown> = {};
    const ctx: PrivacySectionContext = { requestId: job.requestId, sub: job.sub, grantId: job.grantId, type: 'access' };
    for (const section of options.sections.list()) {
      sections[section.id] = section.export ? await section.export(ctx) : null;
    }
    const body = new TextEncoder().encode(JSON.stringify({
      requestId: job.requestId,
      sub: job.sub,
      grantId: job.grantId,
      generatedAt: now().toISOString(),
      sections,
    }));
    if (body.byteLength <= 0) throw new Error('export body is empty');
    const sha256 = createHash('sha256').update(body).digest('hex');
    const upload = await options.client.privacyRequests.exportUploadUrl({
      requestId: job.requestId,
      contentType: 'application/json',
      contentLength: body.byteLength,
      sha256,
    });
    const headers = uploadHeaders('application/json', upload.headers);
    const put = await putExport(upload.uploadUrl, body, headers);
    if (put.status < 200 || put.status >= 300) throw new Error(`export upload failed status=${put.status}`);
    await options.client.privacyRequests.complete({
      requestId: job.requestId,
      outcome: 'fulfilled',
      summary: 'Access export uploaded',
    });
    await options.store.save(stamp(job, { status: 'completed', acknowledged: true, leaseOwner: job.leaseOwner }));
    log.info?.('privacy access fulfilled', { requestId: job.requestId, bytes: body.byteLength });
  }

  async function fulfillErasure(job: PrivacyJob): Promise<void> {
    const erased = await eraseSections({
      requestId: job.requestId,
      sub: job.sub,
      grantId: job.grantId,
      type: 'erasure',
    });
    await options.client.privacyRequests.complete({
      requestId: job.requestId,
      outcome: 'fulfilled',
      summary: `Deleted ${erased.deleted}, anonymised ${erased.anonymised}`,
      retainedCategories: erased.retained,
    });
    await options.store.save(stamp(job, { status: 'completed', acknowledged: true, leaseOwner: job.leaseOwner }));
  }

  async function eraseSections(ctx: PrivacySectionContext): Promise<EraseResult> {
    const retained: RetainedCategory[] = [];
    let deleted = 0;
    let anonymised = 0;
    for (const section of options.sections.list()) {
      if (!section.erase) continue;
      const result = await section.erase(ctx);
      deleted += result.deleted;
      anonymised += result.anonymised;
      retained.push(...result.retained);
    }
    return { deleted, anonymised, retained };
  }

  async function finishReview(job: PrivacyJob, review: PrivacyReviewOutcome): Promise<void> {
    if (review.outcome === 'rejected' && (!review.rejectionReason || !review.legalBasis)) {
      throw new Error('rejected review requires rejectionReason and legalBasis');
    }
    await options.client.privacyRequests.complete({
      requestId: job.requestId,
      outcome: review.outcome,
      summary: review.summary,
      rejectionReason: review.rejectionReason,
      legalBasis: review.legalBasis,
    });
    await options.store.save(stamp(job, { status: 'completed', review, leaseOwner: job.leaseOwner }));
  }

  async function completeReview(requestId: string, outcome: PrivacyReviewOutcome): Promise<void> {
    const job = await options.store.get(requestId);
    if (!job) throw new Error('privacy job not found');
    if (job.status === 'completed' || job.status === 'cancelled') throw new Error(`privacy job is ${job.status}`);
    await options.store.save(stamp(job, {
      status: 'review',
      review: outcome,
      nextAttemptAt: now().toISOString(),
      leaseOwner: job.leaseOwner,
    }));
  }

  async function reconcile(): Promise<{ enqueued: number }> {
    const listed = await options.client.privacyRequests.list();
    let enqueued = 0;
    for (const item of listed.items) {
      const existing = await options.store.get(item.requestId);
      if (existing) continue;
      const at = now().toISOString();
      const result = await options.store.enqueue({
        requestId: item.requestId,
        eventId: `reconcile:${item.requestId}`,
        kind: 'privacy_request.created',
        type: item.type,
        sub: item.sub,
        grantId: item.grantId,
        details: item.details,
        dueAt: item.dueAt,
        status: 'queued',
        attempts: 0,
        nextAttemptAt: at,
        updatedAt: at,
      });
      if (result === 'inserted') enqueued += 1;
    }
    if (enqueued) log.info?.('privacy reconcile enqueued missed requests', { enqueued });
    return { enqueued };
  }

  return { handleEvent, tick, reconcile, completeReview };
}

function jobFromCreatedLike(
  eventId: string,
  data: { requestId: string; type: PrivacyRequestType; sub: string; grantId: string; details?: string; dueAt?: string },
  status: 'queued' | 'cancelled',
  at: string,
): PrivacyJob {
  return {
    requestId: data.requestId,
    eventId,
    kind: status === 'cancelled' ? 'privacy_request.cancelled' : 'privacy_request.created',
    type: data.type,
    sub: data.sub,
    grantId: data.grantId,
    details: data.details,
    dueAt: data.dueAt,
    status,
    attempts: 0,
    nextAttemptAt: at,
    updatedAt: at,
  };
}
