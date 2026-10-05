import { describe, expect, it } from 'vitest';
import { createMongoPrivacyJobStore } from './mongo.js';
import { createPostgresPrivacyJobStore, type PrivacySqlQuery } from './postgres.js';
import type { PrivacyJob } from './types.js';

function job(requestId = 'req-1'): PrivacyJob {
  return {
    requestId,
    eventId: 'evt-1',
    kind: 'privacy_request.created',
    type: 'access',
    sub: 'pairwise-sub',
    grantId: 'g1',
    status: 'queued',
    attempts: 0,
    nextAttemptAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  };
}

describe('mongo privacy job store', () => {
  it('inserts once and leases a due job', async () => {
    const rows = new Map<string, PrivacyJob>();
    const store = createMongoPrivacyJobStore({
      async findOne(filter) {
        return rows.get(String(filter.requestId)) || null;
      },
      async updateOne(filter, update) {
        const id = String(filter.requestId);
        if (update.$setOnInsert && !rows.has(id)) {
          rows.set(id, { ...(update.$setOnInsert as PrivacyJob) });
          return { upsertedCount: 1, matchedCount: 0 };
        }
        const current = rows.get(id);
        if (!current) return { matchedCount: 0 };
        rows.set(id, { ...current, ...(update.$set as Partial<PrivacyJob>) });
        return { matchedCount: 1 };
      },
      find() {
        return { async toArray() { return [...rows.values()]; } };
      },
    });
    expect(await store.enqueue(job())).toBe('inserted');
    expect(await store.enqueue(job())).toBe('exists');
    const leased = await store.lease('2026-10-05T12:00:00.000Z', 'worker-1', 1000, 5);
    expect(leased).toHaveLength(1);
    expect(leased[0].leaseOwner).toBe('worker-1');
  });
});

describe('postgres privacy job store', () => {
  it('treats an empty insert as already stored', async () => {
    const sql: string[] = [];
    const query = (async (text: string) => {
      sql.push(text);
      if (text.includes('INSERT')) return [];
      if (text.includes('SELECT')) return [{ payload: job() }];
      return [{ request_id: 'req-1' }];
    }) as PrivacySqlQuery;
    const store = createPostgresPrivacyJobStore(query);
    expect(await store.enqueue(job())).toBe('exists');
    expect(await store.get('req-1')).toMatchObject({ requestId: 'req-1', sub: 'pairwise-sub' });
    expect(sql.some((line) => line.includes('privacy_jobs'))).toBe(true);
  });
});
