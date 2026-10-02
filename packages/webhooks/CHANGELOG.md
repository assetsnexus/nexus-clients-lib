## 0.2.0
- Typed events for grant lifecycle, field changes, permission decisions, regulatory status, app subscriptions, app roles, and app user block.
- `isNewerVersion(stored, incoming)` for monotonic `rolesVersion` ordering.
- Webhook adapter awaits async idempotency stores and rejects payloads without `eventId`.

## 0.1.0
- Initial release
