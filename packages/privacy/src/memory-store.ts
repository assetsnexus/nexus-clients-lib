import type { PrivacyJob, PrivacyJobStore } from './types.js';

export function createMemoryPrivacyJobStore(): PrivacyJobStore {
  const jobs = new Map<string, PrivacyJob>();
  return {
    async enqueue(job) {
      if (jobs.has(job.requestId)) return 'exists';
      jobs.set(job.requestId, { ...job });
      return 'inserted';
    },
    async get(requestId) {
      const row = jobs.get(requestId);
      return row ? { ...row } : null;
    },
    async lease(nowIso, owner, leaseMs, limit) {
      const now = Date.parse(nowIso);
      const leased: PrivacyJob[] = [];
      for (const job of jobs.values()) {
        if (leased.length >= limit) break;
        if (job.status === 'completed' || job.status === 'cancelled') continue;
        if (job.status === 'review' && !job.review) continue;
        if (Date.parse(job.nextAttemptAt) > now) continue;
        if (job.leaseUntil && Date.parse(job.leaseUntil) > now) continue;
        job.leaseOwner = owner;
        job.leaseUntil = new Date(now + leaseMs).toISOString();
        leased.push({ ...job });
      }
      return leased;
    },
    async save(job) {
      const current = jobs.get(job.requestId);
      if (current?.leaseOwner && job.leaseOwner && current.leaseOwner !== job.leaseOwner) return;
      jobs.set(job.requestId, { ...job, leaseOwner: null, leaseUntil: null });
    },
    async cancel(requestId, nowIso) {
      const job = jobs.get(requestId);
      if (!job) return false;
      if (job.status === 'completed') return true;
      job.status = 'cancelled';
      job.updatedAt = nowIso;
      job.leaseOwner = null;
      job.leaseUntil = null;
      return true;
    },
  };
}
