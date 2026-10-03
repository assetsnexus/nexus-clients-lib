# @nexus/commands-client

Framework-free TypeScript client for the Nexus commands API and Login with Nexus OAuth2.

## Install

```bash
npm i @nexus/commands-client
```

## Node.js

`engines` allows Node.js 18 or newer. `generatePkce` and `verifyAttestation` call the Web Crypto global (`crypto.subtle`). Browsers and Node.js 20+ provide that global. Node 18 keeps working if you assign Web Crypto once before those calls:

```js
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto;
}
```

## Quick start

```ts
import { ElevationRequiredError, NexusClient, StaticTokenProvider } from '@nexus/commands-client';

const client = new NexusClient({
  baseUrl: 'https://region.example.com',
  tokenProvider: new StaticTokenProvider(process.env.NEXUS_TOKEN!),
});

const result = await client.send('anx.user.profile.get', {});
if (result.ok) {
  console.log(result.data);
} else if (result.kind === 'sca_required') {
  // MUST render authorizationText + uiMetadata.dynamicFields next to the factor
} else if (result.kind === 'permission_elevation_required') {
  const elevation = ElevationRequiredError.fromSendResult(result);
  // Send the user to elevation.approvalUrl, then elevation.waitForDecision(client)
} else if (result.kind === 'accepted') {
  // Envelope 102 (or legacy non-SCA 202) — follow anx.long-running.get; do not retry the write
  if (result.taskId) {
    const task = await client.longRunning.waitForTask(result.taskId, {
      pollAfterMs: result.pollAfterMs,
    });
  }
}
```

## Routed regions (0.4.0)

Pass `routes` from a token `anx_region` or login `region` document (`parseRegionRoutes`). Lower `priority` is tried first. `baseUrl` can be omitted when `routes.routes` is non-empty.

```ts
import { NexusClient, parseRegionRoutes } from '@nexus/commands-client';

const routes = parseRegionRoutes(tokenBody);
const client = new NexusClient({
  routes: routes!,
  app: { name: 'partner-portal', version: '1.2.0' },
  health: {
    onReport: (health) => console.log(health.serverVersion),
    onDeprecation: (notice) => console.warn(notice.signature),
  },
});

await client.send('anx.user.profile.get', {}, { commandVersion: 1 });
client.dispose();
```

Every request sends `X-Anx-Client: @nexus/commands-client/<sdk version>`. A valid `app` also sends `X-Anx-App: <name>/<version>`.

Failover: DNS, connection refused, and TLS errors move to the next origin. Timeouts and connection resets do too for reads, and for writes only when `Idempotency-Key` or `x-anx-idempotency-key` is present. HTTP 502/503/504 fail over. HTTP 4xx does not.

A single HTTP 307, or a JSON envelope with `responseCode: 307` and `errorObjects[].code === "REGION_REDIRECT"`, replaces the session routes with `suggestedPeers[].endpoints` (string or `{ url }`) and retries once.

`GET {origin}/health` probes run every 30s. A recovered route becomes primary only after a successful probe and a score lead of at least 10 points.

## Features

- Full command envelope with `requestId` / `traceId`
- SCA/2FA (`202`), data-access approval, permission elevation (`403`), and long-running (`102`) typed results; `client.longRunning` follow/cancel/wait
- Auto `idempotencyKey` for non-read commands (`Idempotency-Key`)
- Routed region transport: `routes` on `NexusClient`, failover, one-shot `REGION_REDIRECT`
- Opt-in health pinger and `X-Anx-Client` / `X-Anx-App` version headers
- Rate-limit / `Retry-After` aware backoff
- **Command connectivity**: `CommandConnectivityController` — strict transport-disconnect classifier, 3 attempts over ~10s, degraded/down state (portal overlay after 20s authenticated / 10s anonymous), read coalesce, `formatConnectivityTooltip`
- OAuth PKCE helpers, JWKS cache, introspection
- Region resolvers (static / country / gateway stub)
- `subject` namespace: consented identities, regulatory status, field claims
- `orgAdmin` reads `anx.compliance.security-policy.get`, `.self-status.get`, and `anx.compliance.org-overview.get` (org session or API key; an app access token is forbidden)
- `permissions.requestBatch` and `ElevationRequiredError.waitForDecision`
- `grant` and `subscriptions` namespaces (`app-subscription.get` currently returns the fixed free tier)
- `/testing` in-memory transport + fixtures
- `npx nexus-commands-codegen --region <url>` typed command map

See the root README and anx-docs Developers guide for full integration levels.
