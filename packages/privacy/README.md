# @nexus/privacy

Server-side kit for a Nexus connected app. It turns `privacy_request.created`, `privacy_request.cancelled`, and `account.erased` into leased jobs, builds the access export, uploads it, and completes the request with the app client.

The kit does not import `prom-client`. Pass `metrics.counter` and `metrics.histogram` if you want Prometheus:

```ts
import client from 'prom-client';

const jobs = new client.Counter({
  name: 'nexus_privacy_jobs_total',
  help: 'Privacy jobs handled by this process',
  labelNames: ['type', 'result'],
});
const seconds = new client.Histogram({
  name: 'nexus_privacy_job_seconds',
  help: 'Privacy job duration',
  labelNames: ['type'],
});

createPrivacyKit({
  client,
  store,
  sections,
  metrics: {
    counter: (name, labels, value = 1) => {
      if (name === 'nexus_privacy_jobs_total') jobs.inc(labels, value);
    },
    histogram: (name, labels, value) => {
      if (name === 'nexus_privacy_job_seconds') seconds.observe(labels, value);
    },
  },
});
```

## Sections

```ts
const sections = createSectionRegistry();
sections.register({
  id: 'profiles',
  export: async (ctx) => loadProfile(ctx.sub),
  erase: async (ctx) => {
    const deleted = await deleteProfile(ctx.sub);
    return { deleted, anonymised: 0, retained: [] };
  },
});
assertSectionCoverage(sections.ids(), ['profiles']);
```

`ctx.sub` is the pairwise subject. Do not expect a Nexus user id.

## Stores

- `createMemoryPrivacyJobStore()` for tests and a single process.
- `@nexus/privacy/mongo` — pass a Mongo collection. Create a unique index on `requestId` first (`createIndex({ requestId: 1 }, { unique: true })`), otherwise two deliveries of the same webhook can both insert.
- `@nexus/privacy/postgres` — pass a `query(sql, params)` function and apply `sql/privacy_jobs.sql`.

## Worker

`handleEvent` is safe to call again for the same `requestId` or `eventId`. `tick` leases due jobs, acknowledges them, and either uploads an access export, runs erasure, or waits for `completeReview` on rectification, restriction, and objection. A `REQUEST_CLOSED` error closes the local job instead of retrying. Eight failures mark the job `failed`. `reconcile` follows `privacyRequests.list()` `nextCursor` until the last page.

Call `tick` and `reconcile` from one worker with a lock so two processes do not upload the same export.
