import {
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
  ModelTier,
  HostingType,
  MentionToken,
  ActivityBarState,
  ConversationSummaryTopic,
  ConversationSummaryTodo,
  ConversationSummaryResult,
} from '@nexus/chat-core';
export {
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
  tierIcon,
  tierSortKey,
  resolveHostingFallback,
  parseMentions,
  computeActivityBar,
  fabBadgeCount,
  fabBadgeLabel,
  saveDraft,
  loadDraft,
  clearDraft,
  clearAllDrafts,
  COMPUTE_TIER_META,
  normalizeComputeTier,
  computeTierIcon,
  computeTierSortKey,
  chatModelPriceLevel,
  modelPriceSymbols,
  HOSTING_BADGE_LABELS,
  findChatContact,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
  CHAT_CONVERSATION_ATTACHMENT_TTL_MS,
  collectFilesFromClipboard,
  collectFilesFromDataTransfer,
  dataTransferHasFiles,
  ensureNamedFile,
  partitionChatAttachmentFiles,
  uploadOptsForChatFileDestination,
  looksLikeImageFile,
} from '@nexus/chat-core';

export { renderChatMarkdown, markdownHasTable, CHAT_MARKDOWN_ROOT_CLASS } from './markdown';
export {
  MediaToolWidget,
  AskUserChoiceToolWidget,
  ScheduleCheckBackToolWidget,
  StorageFileToolWidget,
  DefaultToolRunWidget,
  SubAgentRunWidget,
  ToolCallTimeline,
  toolTimelineProps,
  normalizeToolRun,
  toolStatusClass,
  ensureToolWidgetStyles,
  TOOL_WIDGET_CSS,
} from './tools';

export { default as NexusChatPanel } from './panel/NexusChatPanel.vue';
export { default as SessionSummaryChips } from './panel/SessionSummaryChips.vue';
export { default as GroupRoomLeaveSection } from './panel/GroupRoomLeaveSection.vue';
export { default as GroupRoomSettingsPanel } from './panel/GroupRoomSettingsPanel.vue';
export { default as RoomOrchestrationSection } from './panel/RoomOrchestrationSection.vue';
export { default as RoomOrchestrationRulesEditor } from './panel/RoomOrchestrationRulesEditor.vue';
export { default as RoomParticipantsAiConfig } from './panel/RoomParticipantsAiConfig.vue';
export {
  MAX_ROOM_ORCHESTRATION_RULES,
  MAX_ROOM_ORCHESTRATION_RULE_LENGTH,
  normalizeRoomOrchestrationRules,
  validateRoomOrchestrationRules,
} from './panel/room-orchestration-rules.util.js';
export {
  participantResponseModeFromSelect,
  participantResponseModeSelectValue,
} from './panel/room-participants-ai-config.util.js';
export { default as MentionAutocomplete } from './panel/MentionAutocomplete.vue';
export {
  DEFAULT_PANEL_LABELS,
  formatCallDuration,
  formatCreditCents,
} from './panel/labels';
export type { NexusChatPanelLabels } from './panel/labels';

export { default as RealtimeCallPanel } from './voice/RealtimeCallPanel.vue';
export { default as ActivePhoneChip } from './voice/ActivePhoneChip.vue';
export { default as CallModeChooserModal } from './voice/CallModeChooserModal.vue';

export function contactsFromChat(chat: {
  getState: () => { contacts: Array<{ id: string; name: string; type: string }> };
}) {
  return chat.getState().contacts;
}

export function contactRowProps(contact: {
  id: string;
  name: string;
  type: string;
  unreadCount?: number;
}) {
  return {
    key: contact.id,
    id: contact.id,
    name: contact.name,
    type: contact.type,
    unreadCount: contact.unreadCount || 0,
    isAgent: contact.type === 'agent',
  };
}

export function realtimeCallPanelProps(surface: {
  status?: string;
  elapsedSec?: number;
  muted?: boolean;
  paused?: boolean;
  errorMessage?: string | null;
  mode?: string | null;
}) {
  return {
    status: surface?.status || 'idle',
    elapsedSec: Number(surface?.elapsedSec) || 0,
    muted: !!surface?.muted,
    paused: !!surface?.paused,
    errorMessage: surface?.errorMessage || null,
    mode: surface?.mode || 'browser',
  };
}

export function activePhoneChipProps(surface: {
  status?: string;
  elapsedSec?: number;
  muted?: boolean;
  paused?: boolean;
  label?: string;
}) {
  return {
    status: surface?.status || 'idle',
    elapsedSec: Number(surface?.elapsedSec) || 0,
    muted: !!surface?.muted,
    paused: !!surface?.paused,
    label: surface?.label || '',
  };
}
