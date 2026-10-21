// Emits hand-authored .d.ts for the Vue 3 library build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist');
mkdirSync(dist, { recursive: true });

writeFileSync(
  resolve(dist, 'index.d.ts'),
  `import type { DefineComponent } from 'vue';
import type { MeetingCardModel, MeetingOpenTarget, RoomMediaSession } from '@nexus/meetings-core';

export declare const MeetingCard: DefineComponent<{
  card: MeetingCardModel;
  compact?: boolean;
  onOpen?: (card: MeetingCardModel) => void;
  onOpenRoom?: (roomId: string, card: MeetingCardModel) => void;
}>;

export declare const MeetingView: DefineComponent<{
  card: MeetingCardModel;
  session: RoomMediaSession;
  onModerate?: (id: string, action: 'mute' | 'disable-listening' | 'set-volume', value: boolean | number) => void;
}>;

export { meetingViewTabs, type MeetingViewTab, type MeetingOpenTarget } from '@nexus/meetings-core';
`,
  'utf8',
);

console.log('[meetings-vue3] wrote d.ts');
