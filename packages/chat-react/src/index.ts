import './styles.css';

export { NexusChatApp } from './components/NexusChatApp.js';
export type { NexusChatAppProps } from './components/NexusChatApp.js';
export { ContactList } from './components/ContactList.js';
export { CachedAvatarImage, isPictureCatalogAsset } from './components/CachedAvatarImage.js';
export type { CachedAvatarImageProps } from './components/CachedAvatarImage.js';
export { ThreadView } from './components/ThreadView.js';
export { Composer } from './components/Composer.js';
export { ContactActionSheet } from './components/ContactActionSheet.js';
export { VoiceLayout } from './components/VoiceLayout.js';
export { VoiceAvatarCanvas, FALLBACK_VOICE_VRM } from './components/VoiceAvatarCanvas.js';
export type { VoiceAvatarCanvasProps } from './components/VoiceAvatarCanvas.js';
export { RoomsPanel } from './components/RoomsPanel.js';
export { ApprovalsStrip } from './components/ApprovalsStrip.js';
export { SubAgentsStrip } from './components/SubAgentsStrip.js';
// Plan Part C quick wins (C5 / C8 / C9).
export { PermissionSummaryCard } from './components/PermissionSummaryCard.js';
export type { PermissionSummaryCardProps } from './components/PermissionSummaryCard.js';
export { ExplainActionChip } from './components/ExplainActionChip.js';
export type { ExplainActionChipProps } from './components/ExplainActionChip.js';
export { WorkingOnStrip } from './components/WorkingOnStrip.js';
export type { WorkingOnStripProps } from './components/WorkingOnStrip.js';
// Plan Part W3 — wake-word mic indicator + opt-in toggle.
export { WakeMicIndicator } from './components/WakeMicIndicator.js';
export type { WakeMicIndicatorProps } from './components/WakeMicIndicator.js';
export { loadWakeEngine, wakeEngineAvailable } from './components/wake-engine-bootstrap.js';
export type { WakeEngineChoice } from './components/wake-engine-bootstrap.js';
export {
  WAKE_NOT_AUTH_COPY,
  readWakeWordConfig,
  wakeIndicatorFacts,
  wakeIndicatorView,
  wakeToggleVisible,
} from './components/wake-word-chrome.js';
export type {
  WakeIndicatorView,
  WakePresenceConfig,
  WakeSurfaceState,
  WakeSurfaceStateSnapshot,
} from './components/wake-word-chrome.js';
export {
  buildPermissionSummary,
  permissionSummaryIsEmpty,
  maskAudience,
  summarizeArgs,
  explainLastAction,
  explainInputFromRun,
  explainHasReason,
  buildWorkingOnSummary,
  workingOnRunsFromTurns,
} from './chrome/chat-chrome-cards.js';
export type {
  PermissionSummaryInput,
  PermissionSummary,
  PermissionSummarySection,
  ExplainActionInput,
  ExplainAction,
  ExplainableToolRun,
  WorkingOnItem,
  WorkingOnSummary,
  WorkingOnRunInput,
  WorkingOnLedgerInput,
} from './chrome/chat-chrome-cards.js';
// Plan Part C1 — embodiment playback helpers.
export {
  readEmbodimentProfile,
  resolveEmbodimentFace,
  embodimentLipSyncEnabled,
  playAssistantEmbodiment,
  playSessionRoutine,
  unplayedAssistantTurns,
} from './components/embodiment-playback.js';
export type {
  EmbodimentFace,
  EmbodimentProfileLike,
  EmbodimentPlaybackHost,
} from './components/embodiment-playback.js';
export type { VoiceAvatarHost } from './components/VoiceAvatarCanvas.js';
export { SpendChip } from './components/SpendChip.js';
export type { ContextSpendChipProps } from './components/SpendChip.js';
export { AdminRoutes } from './components/admin/AdminRoutes.js';
export type { AdminPageId } from './components/admin/AdminRoutes.js';
export { ToolTimelineRow } from './components/ToolTimelineRow.js';
export type { ToolTimelineRowProps } from './components/ToolTimelineRow.js';
export { PresenceStudio } from './components/PresenceStudio.js';
export type { PresenceStudioProps } from './components/PresenceStudio.js';
export { FileViewer } from './components/FileViewer.js';
export type { FileViewerTab, FileViewerProps } from './components/FileViewer.js';
export { WorkspaceStrip } from './components/workspace/WorkspaceStrip.js';
export { WorkspacePopup } from './components/workspace/WorkspacePopup.js';
export { ConfigSheet } from './components/config/ConfigSheet.js';
export type { ConfigSheetProps } from './components/config/ConfigSheet.js';
export {
  ClientToolGrantCard,
  DataAccessPromptCard,
  PermissionElevationCard,
  PermissionElevationDock,
  ScaRequiredBanner,
} from './components/grants/GrantCards.js';
export { PendingPauseCardView } from './components/grants/PendingPauseCards.js';
export {
  AskUserChoiceWidget,
  PlanCardView,
  planFromPointer,
} from './components/AskUserChoiceWidget.js';
export type { ClientToolProp } from './page-tools/apply-page-tools-props.js';
export {
  applyToolsProps,
  applyClientToolsProps,
  applyPageToolsProp,
} from './page-tools/apply-page-tools-props.js';
export { CheckBackCard } from './components/grants/CheckBackCard.js';
export {
  pendingElevationPrompt,
  pendingElevationPrompts,
  unwrapElevationList,
  upsertElevationPrompt,
  removeElevationPrompt,
} from './grants/pending-elevation.js';
export type { ElevationListRow } from './grants/pending-elevation.js';

export { FundingQuickSelect } from './components/FundingQuickSelect.js';
export type { FundingQuickSelectProps } from './components/FundingQuickSelect.js';
export { GuestContinue } from './components/GuestContinue.js';
export type { GuestContinueProps } from './components/GuestContinue.js';
export { ModelPicker } from './components/ModelPicker.js';
export type { ModelPickerProps } from './components/ModelPicker.js';
export { loadPickerModels, buildModelOverride, mergePickerModels } from './models/loadPickerModels.js';
export { mergeEntitledModelsForPicker } from './models/mergeEntitledModels.js';
export type { PickerModel } from './models/picker-types.js';

export {
  DEFAULT_THEME,
  themeToCssVars,
  applyThemeToElement,
} from './theme.js';
export type { NexusChatTheme } from './theme.js';
export type { ChatSlots } from './slots.js';
export type { ComposerControls, ComposerCallMode } from './components/composerHost.js';
export {
  DEFAULT_REACT_FEATURES,
  mergeReactFeatures,
  coreFeaturesFromReact,
} from './features.js';
export type { NexusChatReactFeatures } from './features.js';

export {
  createHostBridge,
  listenWindowMessages,
  parseHostMessage,
  drainStashedHostMessages,
  stashHostMessage,
} from './bridge/host-bridge.js';
export type {
  HostToSdkMessage,
  HostPrefillComposerMessage,
  HostPageSitemapMessage,
  HostPageScreenMessage,
  HostClientToolResultMessage,
  HostPageSitemapEntry,
  HostPageScreen,
  HostPageToolSchema,
  SdkToHostMessage,
  SdkClientToolCallMessage,
  HostBridge,
  ChatIdentitySession,
} from './bridge/host-bridge.js';
export { HOST_PREFILL_TEXT_MAX } from './bridge/host-bridge.js';
export { createHostPageTools, HOST_GENERIC_PAGE_TOOLS } from './page-tools/host-page-tools.js';
export type { CreateHostPageToolsInput } from './page-tools/host-page-tools.js';

export {
  parseParticipantPresenceV1,
  mergeParticipantPresenceV1,
  createPresenceStore,
  readPresenceFromProfile,
  writePresenceIntoProfilePatch,
} from './presence/participant-presence.js';
export type { ParticipantPresenceV1 } from './presence/participant-presence.js';

export { renderChatMarkdown, CHAT_MARKDOWN_ROOT_CLASS } from './markdown.js';
export { sortContactsForList } from './utils/sortContacts.js';
export { createSendQueue } from './utils/sendQueue.js';
export type { SendQueue, QueuedSend } from './utils/sendQueue.js';
export { openContactThread, loadConversationHistory } from './utils/openContactFlow.js';
export { useChatState, useChatPanel } from './hooks/useChatState.js';
export {
  createRegionCommandClient,
} from './webview/createRegionCommandClient.js';
export type {
  RegionCommandClientOptions,
  RegionIdentity,
} from './webview/createRegionCommandClient.js';

export {
  sanitizeHtml,
  wrapSanitizedHtmlDocument,
  renderMarkdown,
  normalizeSheetView,
  HTML_PURIFY_CONFIG,
  HTML_VIEWER_CSP,
} from './viewer/file-preview-sanitize.js';
export { detectPreviewKind, PREVIEW_KIND } from './viewer/preview-kind.js';
export { contextUsagePercent, formatContextTokensLabel } from './utils/context-percent.js';
export {
  summarizeSubAgentChip,
  subAgentChipLabel,
  worstSubAgentStatus,
} from './utils/sub-agent-chip.js';

export {
  createNexusChat,
  DEFAULT_FEATURES,
  findChatContact,
  createVoiceModeState,
  modeLabel,
  parsePendingPauseCard,
  parseModeChangedEvent,
  parseUserChoiceQuestion,
  parsePlanCard,
  parsePlanPointer,
  planProgressLabel,
  useModeTransition,
} from '@nexus/chat-core';
export type {
  NexusChat,
  CreateNexusChatOptions,
  LockedAgent,
  ChatContact,
  ChatTurn,
  ChatFeatures,
  VoiceLayoutMode,
  VoiceModeState,
  CommandClient,
  PageToolSource,
  PageToolSchema,
  PageToolPointer,
  PendingPauseCard,
  PendingApprovalCard,
  PendingModeSwitchCard,
  PendingClientToolCard,
  PendingPauseKind,
  ChatClientToolAccess,
  ChatModeChangedEvent,
  ChatExecutionMode,
  UserChoiceQuestion,
  UserChoiceQuestionOption,
  QuestionAnswer,
  PlanPointer,
  PlanCard,
  PlanTodoItem,
} from '@nexus/chat-core';
