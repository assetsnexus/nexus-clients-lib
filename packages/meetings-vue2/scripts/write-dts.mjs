// Emits hand-authored .d.ts for the Vue 2.7 library build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist');
mkdirSync(dist, { recursive: true });

writeFileSync(
  resolve(dist, 'index.d.ts'),
  `import type { VueConstructor } from 'vue';
import type { MeetingCardModel, MeetingOpenTarget, RoomMediaSession } from '@nexus/meetings-core';

export declare const MeetingCard: VueConstructor;
export declare const MeetingView: VueConstructor;

export { meetingViewTabs, type MeetingViewTab, type MeetingOpenTarget, type MeetingCardModel, type RoomMediaSession } from '@nexus/meetings-core';
`,
  'utf8',
);

console.log('[meetings-vue2] wrote d.ts');
