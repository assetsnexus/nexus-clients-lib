# @nexus/meetings-vue2

Vue 2.7 adapter for `@nexus/meetings-core` (portal).

```ts
import { MeetingCard, MeetingView } from '@nexus/meetings-vue2';
```

Same behavior as `@nexus/meetings-vue3`: `MeetingCard` emits `open` / `open-room`,
`MeetingView` provides `video` / `scene` slots, and tab gating is shared from
`@nexus/meetings-core`.
