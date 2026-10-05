## 0.3.0
- Event types match what the region delivers: `grant.revoked`, `grant.fields_changed`, `permission_request.decided`, `regulatory.status_changed`, `notification.action`, `account.erased`. Removed types and helpers for events the region does not send (`grant.updated`, `grant.access_revoked`, `grant.resource_scope_changed`, `privacy.*`, `subscription.*`, `invoice.*`, `app_subscription.*`, `app.config_changed`, `app_roles.changed`, `app_user.*`, `agent_funding.changed`) and the helpers `APP_SUBSCRIPTION_EVENTS`, `isAppSubscriptionEvent`, `isNewerVersion`, `completePrivacyRequest`.
- `AccountErasedData` (`clientId`, `grantIds`, `subs`, `reason: 'user_erasure'`). `NotificationActionData.sub`.
- Idempotency store is `{ has, add }` (`IdempotencyStore`). `expressAdapter` records the `eventId` only after the handler succeeded and answers `500 handler_failed` on a throw, so the Nexus retry is processed. Optional `onError`.
- `expressAdapter` parses the verified raw body and ignores `req.body`.
- `createIdempotencyStore({ maxEntries })` is bounded (default 10 000).

## 0.2.1
- Typed `notification.action` event (`notificationId`, `actionId`, `subject`, `occurredAt`).

## 0.2.0
- Typed events for grant lifecycle, field changes, permission decisions, regulatory status, app subscriptions, app roles, and app user block.
- `isNewerVersion(stored, incoming)` for monotonic `rolesVersion` ordering.
- Webhook adapter awaits async idempotency stores and rejects payloads without `eventId`.

## 0.1.0
- Initial release
