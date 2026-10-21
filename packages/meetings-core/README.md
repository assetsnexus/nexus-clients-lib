# @nexus/meetings-core

Headless, framework-free meetings model for the whole Nexus surface: the
multi-provider meeting catalog, the shared meeting card projection, the room
media session contract, and agent moderation.

Used by `@nexus/meetings-react`, `@nexus/meetings-vue3`, `@nexus/meetings-vue2`,
the desktop app, the portal, and external Nexus apps.

## Multi-provider catalog

```ts
import { MEETING_PROVIDERS, buildMeetingCard, resolveOpenTarget } from '@nexus/meetings-core';

const card = buildMeetingCard({
  id: 'evt-1',
  title: 'Weekly sync',
  startsAt: '2026-05-01T09:00:00.000Z',
  endsAt: '2026-05-01T09:30:00.000Z',
  provider: 'zoom', // or 'nexus' | 'teams' | 'google_meet' | 'webex' | 'custom' | 'in_person'
  joinUrl: 'https://zoom.us/j/123',
});

resolveOpenTarget(card); // { kind: 'external', url: 'https://zoom.us/j/123' }
```

The provider is resolved from explicit metadata, then auto-detected from the
join URL host, then from a `roomId`, then falls back to `in_person`.
The card's `surfaces` (`video`, `participants`, `scene`, `screenshare`) gate
which tabs a host renders — a Zoom meeting shows participants/description, a
nexus room shows video, screenshare, and the 3D scene.

## Room media session + moderation

```ts
import { createEmptyRoomSession, applyModeration, upsertParticipant } from '@nexus/meetings-core';

let session = upsertParticipant(createEmptyRoomSession('room-42'), {
  id: 'agent-1',
  kind: 'asset_agent',
  displayName: 'Tank',
  transport: 'audio',
  muted: false,
  listening: true,
  volume: 1,
});

session = applyModeration(session, 'agent-1', { type: 'disable-listening' });
```

Agents (virtual employees, asset agents, app agents) participate over the same
room rails as humans; moderation mirrors the group-conversation controls.
