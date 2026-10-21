// Emits hand-authored .d.ts for the library build (React JSX -> types).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist');
mkdirSync(dist, { recursive: true });

writeFileSync(
  resolve(dist, 'index.d.ts'),
  `import type { CSSProperties, ReactNode } from 'react';
import type {
  MeetingCardModel,
  MeetingParticipant,
  MeetingSceneOccupant,
  MeetingVoiceCapabilities,
  MeetingVoiceMode,
  RoomMediaSession,
  VoiceEngineEndpointInput,
} from '@nexus/meetings-core';

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

export type MeetingVoiceBarProps = {
  capabilities: MeetingVoiceCapabilities;
  mode?: MeetingVoiceMode | null;
  active?: boolean;
  statusText?: string;
  muted?: boolean;
  fellBack?: boolean;
  preferLocal?: boolean;
  onSelectMode?: (mode: MeetingVoiceMode) => void;
  onTogglePreferLocal?: (preferLocal: boolean) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
};
export declare function MeetingVoiceBar(props: MeetingVoiceBarProps): JSX.Element;

export type MeetingSceneTabProps = {
  occupants: MeetingSceneOccupant[];
  sceneRenderer?: ReactNode;
  voice?: MeetingVoiceBarProps;
  onFocusOccupant?: (occupantId: string) => void;
  emptyHint?: string;
};
export declare function MeetingSceneTab(props: MeetingSceneTabProps): JSX.Element;

export { endpointTlsWarning, resolveVoiceEngineEndpoint, type VoiceEngineEndpointInput } from '@nexus/meetings-core';
export { meetingViewTabs, type MeetingViewTab } from '@nexus/meetings-core';
`,
  'utf8',
);

writeFileSync(resolve(dist, 'style.css'), '/* @nexus/meetings-react styles are inline */\n', 'utf8');
console.log('[meetings-react] wrote d.ts + style.css');
