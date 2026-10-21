# @nexus/meetings-react

React adapter for `@nexus/meetings-core`: the shared `MeetingCard` and the
capability-gated `MeetingView` used by the desktop app and Nexus-hosted React
apps.

```tsx
import { MeetingCard, MeetingView } from '@nexus/meetings-react';
import { buildMeetingCard } from '@nexus/meetings-core';

const card = buildMeetingCard({ /* calendar entry */ });

<MeetingCard card={card} onOpenRoom={(roomId) => openRoom(roomId)} />

<MeetingView
  card={card}
  session={session}
  videoSlot={<MyVideoSurface />}
  sceneSlot={<ClusterScene />}
  onModerate={(id, action, value) => moderate(id, action, value)}
/>
```

Tabs come from `meetingViewTabs` in `@nexus/meetings-core`, so React, Vue, and
native hosts render the same surfaces for the same meeting.
