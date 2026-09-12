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
  collectSubAgentRuns,
  activeSubAgentCountFromTurns,
  mapConversationListItem,
  subscribeConversationActivity,
  pauseAgentRun,
  cancelAgentRun,
  resumeAgentRun,
  messageAgentRun,
  getAgentRunPlan,
  listAgentRunTasks,
  updateAgentRunTask,
  listAgentRuns,
  getAgentRun,
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
  ChatSessionSummary,
  AgentRunSummary,
  SubAgentStripItem,
  MessageDelivery,
  ActivityConnectionStatus,
  ActivityEvent,
  ActivityEventData,
  ActivitySubscribeOptions,
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
  collectSubAgentRuns,
  activeSubAgentCountFromTurns,
  mapConversationListItem,
  subscribeConversationActivity,
  pauseAgentRun,
  cancelAgentRun,
  resumeAgentRun,
  messageAgentRun,
  getAgentRunPlan,
  listAgentRunTasks,
  updateAgentRunTask,
  listAgentRuns,
  getAgentRun,
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
  ModeRefusalChipWidget,
  SubAgentRunWidget,
  SubAgentsStrip,
  DeliveryModePicker,
  ToolCallTimeline,
  toolTimelineProps,
  normalizeToolRun,
  toolStatusClass,
  ensureToolWidgetStyles,
  TOOL_WIDGET_CSS,
} from './tools';

// Explicit default imports — Vue 2 webpack/ts-loader can leave
// `export { default as X } from '*.vue'` as undefined named bindings.
import NexusChatPanel from './panel/NexusChatPanel.vue';
import SessionSummaryChips from './panel/SessionSummaryChips.vue';
import LinkedSubChatBanner from './panel/LinkedSubChatBanner.vue';
import SpeakTurnWidget from './panel/SpeakTurnWidget.vue';
import VoiceInputOverlay from './panel/VoiceInputOverlay.vue';
import ConversationBillingPopover from './panel/ConversationBillingPopover.vue';
import GroupRoomLeaveSection from './panel/GroupRoomLeaveSection.vue';
import GroupRoomSettingsPanel from './panel/GroupRoomSettingsPanel.vue';
import RoomOrchestrationSection from './panel/RoomOrchestrationSection.vue';
import RoomOrchestrationRulesEditor from './panel/RoomOrchestrationRulesEditor.vue';
import RoomParticipantsAiConfig from './panel/RoomParticipantsAiConfig.vue';
import MentionAutocomplete from './panel/MentionAutocomplete.vue';
import RealtimeCallPanel from './voice/RealtimeCallPanel.vue';
import ActivePhoneChip from './voice/ActivePhoneChip.vue';
import CallModeChooserModal from './voice/CallModeChooserModal.vue';
import DialInInstructions from './voice/DialInInstructions.vue';

export {
  NexusChatPanel,
  SessionSummaryChips,
  LinkedSubChatBanner,
  SpeakTurnWidget,
  VoiceInputOverlay,
  ConversationBillingPopover,
  GroupRoomLeaveSection,
  GroupRoomSettingsPanel,
  RoomOrchestrationSection,
  RoomOrchestrationRulesEditor,
  RoomParticipantsAiConfig,
  MentionAutocomplete,
  RealtimeCallPanel,
  ActivePhoneChip,
  CallModeChooserModal,
  DialInInstructions,
}
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
export {
  DEFAULT_PANEL_LABELS,
  formatCallDuration,
  formatCreditCents,
  formatMoneyMinor,
  spendLabelForCurrency,
} from './panel/labels';
export type { NexusChatPanelLabels } from './panel/labels';

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
