# @nexus/webhooks

HMAC verification and typed handlers for Nexus partner webhook events.

```ts
import { verifySignature, isNewerVersion, expressAdapter } from '@nexus/webhooks';
```

`X-Nexus-Signature` is `t=<unix>,v1=<hex>`. Pass the current secret and the previous secret during rotation. Compare `rolesVersion` with `isNewerVersion` before applying `app_roles.changed`.
