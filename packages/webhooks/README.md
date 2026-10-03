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
import { verifySignature, isNewerVersion, expressAdapter } from '@nexus/webhooks';
```

`X-Nexus-Signature` is `t=<unix>,v1=<hex>`. Pass the current secret and the previous secret during rotation. Compare `rolesVersion` with `isNewerVersion` before applying `app_roles.changed`.
