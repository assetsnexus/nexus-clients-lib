import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const dts = `export {
  createNexusChat,
  AI_DISCLOSURE_REQUIRED,
  DEFAULT_FEATURES,
  mergeToolStreamEvents,
  rehydrateToolRunsFromHistory,
  patchToolRunStatus,
  applyStreamEventToTurns,
  pollWorkload,
  parseScheduleCheckBackResult,
  isScheduleCheckBackTool,
  parsePresentFileItems,
  parseMediaImages,
  parseUserChoiceOptions,
} from '@nexus/chat-core';
export type {
  NexusChat,
  ChatFeatures,
  CreateNexusChatOptions,
  ChatContact,
  ChatToolRun,
  PresentFileItem,
  MediaCarouselImage,
  UserChoiceOption,
  ScheduleCheckBackResult,
} from '@nexus/chat-core';

export declare function renderChatMarkdown(text: string): string;
export declare function markdownHasTable(text: string | null | undefined): boolean;
export declare const CHAT_MARKDOWN_ROOT_CLASS: string;

export declare const MediaToolWidget: Record<string, unknown>;
export declare const AskUserChoiceToolWidget: Record<string, unknown>;
export declare const ScheduleCheckBackToolWidget: Record<string, unknown>;
export declare const StorageFileToolWidget: Record<string, unknown>;
export declare const DefaultToolRunWidget: Record<string, unknown>;
export declare const SubAgentRunWidget: Record<string, unknown>;
export declare const ToolCallTimeline: Record<string, unknown>;

export declare function toolTimelineProps(events: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
export declare function normalizeToolRun(ev: Record<string, unknown>): Record<string, unknown>;
export declare function toolStatusClass(status: string | undefined): string;
export declare function ensureToolWidgetStyles(): void;
export declare const TOOL_WIDGET_CSS: string;

export declare const NexusChatPanel: Record<string, unknown>;
export declare const GroupRoomLeaveSection: Record<string, unknown>;
export declare const RealtimeCallPanel: Record<string, unknown>;
export declare const ActivePhoneChip: Record<string, unknown>;
export declare const CallModeChooserModal: Record<string, unknown>;

export type NexusChatPanelLabels = {
  contacts?: string;
  rooms?: string;
  newRoom?: string;
  messages?: string;
  composerPlaceholder?: string;
  send?: string;
  attach?: string;
  call?: string;
  streaming?: string;
  contextCompacted?: string;
  usageEmpty?: string;
  throttled?: string;
  spendLimit?: string;
  spendLimitHint?: string;
  pending?: string;
  voiceSession?: string;
  endCall?: string;
  dial?: string;
  code?: string;
  uploading?: string;
};
export declare const DEFAULT_PANEL_LABELS: Required<NexusChatPanelLabels>;
export declare function formatCallDuration(sec: number | null | undefined): string;
export declare function formatCreditCents(cents: number | null | undefined): string;

export declare function contactsFromChat(chat: {
  getState: () => { contacts: Array<{ id: string; name: string; type: string }> };
}): Array<{ id: string; name: string; type: string }>;

export declare function contactRowProps(contact: {
  id: string;
  name: string;
  type: string;
  unreadCount?: number;
}): {
  key: string;
  id: string;
  name: string;
  type: string;
  unreadCount: number;
  isAgent: boolean;
};

export declare function realtimeCallPanelProps(surface: {
  status?: string;
  elapsedSec?: number;
  muted?: boolean;
  paused?: boolean;
  errorMessage?: string | null;
  mode?: string | null;
}): {
  status: string;
  elapsedSec: number;
  muted: boolean;
  paused: boolean;
  errorMessage: string | null;
  mode: string;
};

export declare function activePhoneChipProps(surface: {
  status?: string;
  elapsedSec?: number;
  muted?: boolean;
  paused?: boolean;
  label?: string;
}): {
  status: string;
  elapsedSec: number;
  muted: boolean;
  paused: boolean;
  label: string;
};
`;

writeFileSync(join(dir, 'index.d.ts'), dts);
writeFileSync(join(dir, 'index.d.cts'), dts);
console.log('wrote dist/index.d.ts');
