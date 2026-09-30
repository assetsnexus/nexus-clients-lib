# @nexus/chat-react

React 19 UI for Nexus messenger embeds (WebView, portal experiments). Headless logic lives in [`@nexus/chat-core`](../chat-core).

## Install

```bash
npm install @nexus/chat-react @nexus/chat-core react react-dom
```

Monorepo dev: this package depends on `file:../chat-core`.

## Mount

```tsx
import { NexusChatApp, createNexusChat } from '@nexus/chat-react';
import '@nexus/chat-react/style.css';

const chat = createNexusChat({ client: myCommandClient });

root.render(
  <NexusChatApp
    chat={chat}
    client={myCommandClient}
    theme={{ colorAccent: '#6ea8fe', density: 'comfortable' }}
    features={{ adminPanels: false }}
    onPostToHost={(msg) => nativeBridge.postMessage(JSON.stringify(msg))}
  />,
);
```

Or pass `createOptions` instead of a pre-built `chat` instance.

## CSS variables

Theme tokens are applied on the root `.nexus-chat` element (see `themeToCssVars`):

| Variable | Purpose |
|----------|---------|
| `--nx-chat-bg` | App background |
| `--nx-chat-surface` | Panels / composer |
| `--nx-chat-text` | Primary text |
| `--nx-chat-muted` | Secondary text |
| `--nx-chat-accent` | Buttons / highlights |
| `--nx-chat-border` | Dividers |
| `--nx-chat-font` | Font family |
| `--nx-chat-font-size` | Base size |
| `--nx-chat-radius` | Corner radius |
| `--nx-chat-gap` / `--nx-chat-pad` | Spacing (density) |

## Slots

Optional `slots` prop on `NexusChatApp`:

- `header` — top bar
- `composer` — replace default textarea composer
- `empty` — empty thread state
- `contactRow` — custom contact list row

## Feature flag: `adminPanels`

`features.adminPanels` defaults to **`false`**. When enabled, the header shows an **Admin** toggle with placeholder routes: Brain, Memory, Automations, Cost, Proxy key.

Other flags mirror `@nexus/chat-core` `ChatFeatures` (`groups`, `calls`, …).

## WebView host bridge

`createHostBridge` / `listenWindowMessages` typed `postMessage` contract:

**Shell → SDK:** `auth`, `theme`, `locale`, `route` (`chat` \| `scene`), `openContact`

**SDK → shell:** `minimize`, `unread`, `openScene`, `voiceActive`

Pass `onPostToHost` to `NexusChatApp` to emit SDK messages.

## Participant presence (VRM / voice)

`parseParticipantPresenceV1`, `createPresenceStore`, `readPresenceFromProfile`, and `writePresenceIntoProfilePatch` help persist avatar/voice prefs when the backend has no dedicated field yet.

When saving profiles via existing region commands, merge `writePresenceIntoProfilePatch(doc)` into `user.profile` or `membership.publicProfile` (sets nested `presence` plus soft `vrmUrl` / `avatar3dUrl`).

## Local dev playground

```bash
cd packages/chat-react
npm install
npm run dev
```

Opens `dev/index.html` with a mock `CommandClient` (port **5179**).

## Build

```bash
npm run build   # dist/index.mjs, dist/index.js, dist/style.css
npm run typecheck
npm test
```
