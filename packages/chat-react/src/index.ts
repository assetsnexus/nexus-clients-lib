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
  ScaRequiredBanner,
} from './components/grants/GrantCards.js';
export { CheckBackCard } from './components/grants/CheckBackCard.js';

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
  SdkToHostMessage,
  HostBridge,
} from './bridge/host-bridge.js';

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
} from '@nexus/chat-core';
export type {
  NexusChat,
  CreateNexusChatOptions,
  ChatContact,
  ChatTurn,
  ChatFeatures,
  VoiceLayoutMode,
  VoiceModeState,
  CommandClient,
} from '@nexus/chat-core';
