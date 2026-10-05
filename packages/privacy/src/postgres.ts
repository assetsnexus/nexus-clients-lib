import type { PrivacyJob, PrivacyJobStore } from './types.js';

export type PrivacySqlQuery = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type JobRow = { payload: PrivacyJob | string };

function readJob(row: JobRow): PrivacyJob {
  return typeof row.payload === 'string' ? JSON.parse(row.payload) as PrivacyJob : row.payload;
}

/** Postgres store. Apply `sql/privacy_jobs.sql` before use. `query` is an injected client. */
export function createPostgresPrivacyJobStore(query: PrivacySqlQuery): PrivacyJobStore {
  return {
    async enqueue(job) {
      const rows = await query<{ request_id: string }>(
        `INSERT INTO privacy_jobs
          (request_id, event_id, kind, type, sub, grant_id, details, due_at, payload, status, attempts, next_attempt_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING request_id`,
        [
          job.requestId, job.eventId, job.kind, job.type, job.sub, job.grantId,
          job.details ?? null, job.dueAt ?? null, JSON.stringify(job), job.status,
          job.attempts, job.nextAttemptAt, job.updatedAt,
        ],
      );
      return rows.length ? 'inserted' : 'exists';
    },
    async get(requestId) {
      const rows = await query<JobRow>('SELECT payload FROM privacy_jobs WHERE request_id = $1', [requestId]);
      return rows[0] ? readJob(rows[0]) : null;
    },
    async lease(nowIso, owner, leaseMs, limit) {
      const until = new Date(Date.parse(nowIso) + leaseMs).toISOString();
      const rows = await query<JobRow>(
        `UPDATE privacy_jobs SET lease_owner = $1, lease_until = $2
         WHERE request_id IN (
           SELECT request_id FROM privacy_jobs
           WHERE (status = 'queued' OR (status = 'review' AND payload->'review' IS NOT NULL))
             AND next_attempt_at <= $3
             AND (lease_until IS NULL OR lease_until <= $3)
           ORDER BY next_attempt_at
           LIMIT $4
           FOR UPDATE SKIP LOCKED
         )
         RETURNING payload`,
        [owner, until, nowIso, limit],
      );
      return rows.map((row) => ({ ...readJob(row), leaseOwner: owner, leaseUntil: until }));
    },
    async save(job) {
      await query(
        `UPDATE privacy_jobs
         SET payload = $2::jsonb, status = $3, attempts = $4, next_attempt_at = $5,
             lease_owner = NULL, lease_until = NULL, updated_at = $6
         WHERE request_id = $1 AND (lease_owner IS NULL OR lease_owner = $7)`,
        [job.requestId, JSON.stringify({ ...job, leaseOwner: null, leaseUntil: null }), job.status, job.attempts, job.nextAttemptAt, job.updatedAt, job.leaseOwner ?? null],
      );
    },
    async cancel(requestId, nowIso) {
      const rows = await query<{ request_id: string }>(
        `UPDATE privacy_jobs SET status = 'cancelled', updated_at = $2, lease_owner = NULL, lease_until = NULL
         WHERE request_id = $1 AND status <> 'completed'
         RETURNING request_id`,
        [requestId, nowIso],
      );
      return rows.length > 0;
    },
  };
}
