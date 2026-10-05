# Changelog

## 0.1.0

- `createPrivacyKit` acknowledges privacy requests, uploads an access export, runs erasure sections, and completes review outcomes.
- In-memory, Mongo, and Postgres job stores. Postgres ships `sql/privacy_jobs.sql`.
- `assertSectionCoverage` fails when the registered sections and the declared inventory differ.
