import type { PrivacyJob, PrivacyJobStore } from './types.js';

/** Minimal Mongo collection. Pass `db.collection('privacy_jobs')`. */
export interface PrivacyMongoCollection {
  findOne(filter: Record<string, unknown>): Promise<PrivacyJob | null>;
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { upsert?: boolean },
  ): Promise<{ upsertedCount?: number; matchedCount?: number }>;
  find(filter: Record<string, unknown>): { toArray(): Promise<PrivacyJob[]> };
}

export function createMongoPrivacyJobStore(collection: PrivacyMongoCollection): PrivacyJobStore {
  return {
    async enqueue(job) {
      const existing = await collection.findOne({ requestId: job.requestId });
      if (existing) return 'exists';
      await collection.updateOne({ requestId: job.requestId }, { $setOnInsert: job }, { upsert: true });
      return 'inserted';
    },
    get(requestId) {
      return collection.findOne({ requestId });
    },
    async lease(nowIso, owner, leaseMs, limit) {
      const now = new Date(nowIso);
      const due = await collection.find({
        status: { $in: ['queued', 'review'] },
        nextAttemptAt: { $lte: nowIso },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lte: nowIso } }],
      }).toArray();
      const leased: PrivacyJob[] = [];
      for (const job of due) {
        if (leased.length >= limit) break;
        if (job.status === 'review' && !job.review) continue;
        const until = new Date(now.getTime() + leaseMs).toISOString();
        const result = await collection.updateOne(
          {
            requestId: job.requestId,
            $or: [{ leaseUntil: null }, { leaseUntil: { $lte: nowIso } }, { leaseOwner: owner }],
          },
          { $set: { leaseOwner: owner, leaseUntil: until } },
        );
        if ((result.matchedCount ?? 0) > 0) leased.push({ ...job, leaseOwner: owner, leaseUntil: until });
      }
      return leased;
    },
    async save(job) {
      await collection.updateOne(
        { requestId: job.requestId },
        { $set: { ...job, leaseOwner: null, leaseUntil: null } },
      );
    },
    async cancel(requestId, nowIso) {
      const result = await collection.updateOne(
        { requestId, status: { $ne: 'completed' } },
        { $set: { status: 'cancelled', updatedAt: nowIso, leaseOwner: null, leaseUntil: null } },
      );
      return (result.matchedCount ?? 0) > 0;
    },
  };
}
