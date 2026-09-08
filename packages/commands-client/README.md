# @nexus/commands-client

Framework-free TypeScript client for the Nexus commands API and Login with Nexus OAuth2.

## Install

```bash
npm i @nexus/commands-client
```

## Quick start

```ts
import { NexusClient, StaticTokenProvider } from '@nexus/commands-client';

const client = new NexusClient({
  baseUrl: 'https://region.example.com',
  tokenProvider: new StaticTokenProvider(process.env.NEXUS_TOKEN!),
});

const result = await client.send('anx.user.profile.get', {});
if (result.ok) {
  console.log(result.data);
} else if (result.kind === 'sca_required') {
  // MUST render authorizationText + uiMetadata.dynamicFields next to the factor
} else if (result.kind === 'accepted') {
  // Envelope 102 (or legacy non-SCA 202) — follow anx.long-running.get; do not retry the write
  if (result.taskId) {
    const task = await client.longRunning.waitForTask(result.taskId, {
      pollAfterMs: result.pollAfterMs,
    });
  }
}
```

## Features

- Full command envelope with `requestId` / `traceId`
- SCA/2FA (`202`) and long-running (`102`) typed results; `client.longRunning` follow/cancel/wait
- Auto `idempotencyKey` for non-read commands
- Rate-limit / `Retry-After` aware backoff
- OAuth PKCE helpers, JWKS cache, introspection
- Region resolvers (static / country / gateway stub)
- `grant` and `subscriptions` namespaces
- `/testing` in-memory transport + fixtures
- `npx nexus-commands-codegen --region <url>` typed command map

See the root README and anx-docs Developers guide for full integration levels.
