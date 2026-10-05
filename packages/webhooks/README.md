# @nexus/webhooks

HMAC verification and typed handlers for Nexus partner webhook events.

## Install

From the public GitHub repo, pinned to a release tag. `prepare` builds `dist/` on install. pnpm 10 only runs that script when the package is in `pnpm.onlyBuiltDependencies`:

```json
{
  "dependencies": {
    "@nexus/webhooks": "github:assetsnexus/nexus-clients-lib#sdk-v0.4.1&path:/packages/webhooks"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["@nexus/webhooks"]
  }
}
```

```ts
import { expressAdapter, verifySignature, type IdempotencyStore } from '@nexus/webhooks';

app.post('/webhooks/nexus', expressAdapter({
  secret: [process.env.NEXUS_WEBHOOK_SECRET!, process.env.NEXUS_WEBHOOK_SECRET_PREVIOUS!].filter(Boolean),
  idempotency: sharedStore, // { has(eventId), add(eventId) } backed by your DB or Redis
  handlers: {
    'grant.revoked': async (e) => { /* end sessions for e.data.grantId */ },
    'account.erased': async (e) => { /* delete local users for e.data.subs */ },
  },
  onError: (err, e) => log.error({ err, eventId: e.eventId }),
}));
```

`X-Nexus-Signature` is `t=<unix>,v1=<hex>`. Pass the current secret and the previous secret during rotation. The adapter requires `req.rawBody` (string or Buffer) and parses that verified body.

Idempotency: the adapter checks `has(eventId)` first and calls `add(eventId)` only after your handler resolved. A throwing handler answers `500`, Nexus retries the same `eventId`, and the retry runs the handler again. `createIdempotencyStore()` is in-process and bounded. Use a shared store when you run more than one instance.

Delivered events: `grant.revoked`, `grant.fields_changed`, `permission_request.decided`, `regulatory.status_changed`, `notification.action`, `account.erased`. `account.erased` data is `clientId`, `grantIds`, `subs`, and `reason: user_erasure`.
