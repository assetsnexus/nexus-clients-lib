# @nexus/scene-client

Headless scene client for ANX cluster play / inference scene authority. Matches the `/rooms` Socket.IO events (`scene:join`, `scene:intent`, `scene:snapshot`, `scene:delta`, `scene:joints`).

No Three.js. Pass any duck-typed Socket.IO client (`emit`, `on`, `off`, optional `connected`).

```ts
import {
  createSceneClient,
  createRemoteSceneClient,
  fetchSceneJoinTicket,
  probeSceneServer,
} from '@nexus/scene-client'
```

Peer dependency `socket.io-client` is optional — bring your own socket instance.
