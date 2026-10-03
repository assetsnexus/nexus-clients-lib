# @nexus/notifications-core

Headless notification routing shared by the portal and the ANX app. No UI, no runtime dependencies, and no imports from region-node or either client.

```ts
import {
  resolveNotificationTarget,
  visibleActions,
  buildNotificationAskContext,
  formatAskFragment,
} from '@nexus/notifications-core';
```

`resolveNotificationTarget` picks one destination. Precedence is `presentation.link`, legacy `data.deepLink`, an event-key rule with its id, a recognized object id, the event-key section, category, tags, type, then none. Portal paths keep the `/user` and `/b2b` alignment of the current console.
