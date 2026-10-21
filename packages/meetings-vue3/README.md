# @nexus/meetings-vue3

Vue 3 adapter for `@nexus/meetings-core` (same components as
`@nexus/meetings-react`).

```ts
import { MeetingCard, MeetingView } from '@nexus/meetings-vue3';
```

`MeetingCard` emits `open` (the card) and `open-room` (roomId, card); without
listeners an external provider URL opens via `window.open`. `MeetingView`
exposes `video` and `scene` slots. Tab gating is shared from
`@nexus/meetings-core`.
