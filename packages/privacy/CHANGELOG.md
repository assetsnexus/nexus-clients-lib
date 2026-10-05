# Changelog

## 0.1.2

- A lost `complete` response (`REQUEST_CLOSED`) closes the local job as completed, rejected, or cancelled. The kit reads `privacyRequests.get` when the error has no status. A request that is not visible is cancelled locally. Eight failed attempts mark the job `failed` and stop the retry.
- `reconcile` follows `nextCursor` until the last page. A repeated cursor or 200 pages stops the walk and reports `truncated`.

## 0.1.1

- The access export PUT sends one `content-type`. 0.1.0 merged the region `Content-Type` with its own lower-case default, so `fetch` sent `application/json, application/json` and the presigned upload failed its signature check.
- The Mongo store fences `save` on the lease owner, like the Postgres store.
- The Postgres store no longer leases review jobs that are still waiting for `completeReview`.

## 0.1.0

- `createPrivacyKit` acknowledges privacy requests, uploads an access export, runs erasure sections, and completes review outcomes.
- In-memory, Mongo, and Postgres job stores. Postgres ships `sql/privacy_jobs.sql`.
- `assertSectionCoverage` fails when the registered sections and the declared inventory differ.
