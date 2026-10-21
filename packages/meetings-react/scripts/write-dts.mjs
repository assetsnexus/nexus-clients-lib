// Emits hand-authored .d.ts for the library build (React JSX -> types).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist');
mkdirSync(dist, { recursive: true });

writeFileSync(
  resolve(dist, 'index.d.ts'),
  `import type { CSSProperties, ReactNode } from 'react';
import type { MeetingCardModel, MeetingParticipant, RoomMediaSession } from '@nexus/meetings-core';

export type MeetingCardProps = {
  card: MeetingCardModel;
  onOpen?: (card: MeetingCardModel) => void;
  onOpenRoom?: (roomId: string, card: MeetingCardModel) => void;
  compact?: boolean;
};
export declare function MeetingCard(props: MeetingCardProps): JSX.Element;

export type MeetingViewProps = {
  card: MeetingCardModel;
  session: RoomMediaSession;
  videoSlot?: ReactNode;
  sceneSlot?: ReactNode;
  onModerate?: (participantId: string, action: 'mute' | 'disable-listening' | 'set-volume', value: boolean | number) => void;
};
export declare function MeetingView(props: MeetingViewProps): JSX.Element;
export { meetingViewTabs, type MeetingViewTab } from '@nexus/meetings-core';
`,
  'utf8',
);

writeFileSync(resolve(dist, 'style.css'), '/* @nexus/meetings-react styles are inline */\n', 'utf8');
console.log('[meetings-react] wrote d.ts + style.css');
