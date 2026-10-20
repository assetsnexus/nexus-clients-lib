import type {
  ChatTransport,
  AgentSource,
  ChatFeatures,
  ChatHooks,
  ChatSendOutcomeCode,
  ChatToolDescriptor,
  ChatClientToolAccess,
  ChatContact,
  ChatCreditsState,
  ChatBillingIssueState,
  ChatBillingIssueCode,
  ChatModelOverride,
  ChatRoomPresence,
  ChatRoomSummary,
  ChatRoomDetail,
  ChatRoomOrchestration,
  ChatRoomLeaveAction,
  ChatRoomParticipant,
  ChatRoomParticipantAiConfig,
  ChatSpendLimitsState,
  ChatThrottleState,
  ChatUsageSnapshot,
  ChatVoiceCallSession,
  IoDescriptor,
} from './types.js';
import { DEFAULT_FEATURES } from './types.js';
import {
  normalizeHostPageContext,
  normalizeAppRouteContext,
  appRouteToBrowserContext,
  type HostPageContext,
  type AppRouteContext,
} from './host-page-context.js';

export {
  normalizeHostPageContext,
  normalizeAppRouteContext,
  appRouteToBrowserContext,
  type HostPageContext,
  type AppRouteContext,
} from './host-page-context.js';
import { StreamEndpointResolver } from './stream/stream-endpoint-resolver.js';
import {
  LiveAttachSession,
  type LiveAttachOutcome,
  type LiveAttachResult,
} from './stream/live-attach.js';
import {
  parseStreamMessage,
  applyStreamEventToTurns,
  isEmptyAssistantTurn,
  isGenerationStartStreamEvent,
  shouldDropReplayedStreamEvent,
} from './stream/stream-events.js';
import {
  emptyWatermark,
  pollNewerAssistantMessage,
  watermarkFromMessages,
  type AssistantWatermark,
  type ListedChatMessage,
} from './stream/pending-reply.js';
import { applyRoomDispatchPlan, mergePrependedTurns, shouldKeepRoomAssistantPlaceholder } from './history-turns.js';
import {
  dataAccessApprovalInfoFrom,
  type DataAccessApprovalInfo,
} from './stream/data-access-approval.js';
import { collapseRepeatedToolRows } from './stream/rehydrate-collapse.js';
import { classifyChatBillingIssue } from './billing/classify-billing-issue.js';
import {
  rehydrateToolRunsFromHistory,
  patchToolRunStatus,
} from './stream/tool-events.js';
import type { ChatTurn, PanelState, ChatToolRun } from './state.js';
import { pollWorkload, type WorkloadPollOptions } from './workloads.js';
import {
  BrowserCallRuntime,
  createVoiceApi,
  createWakeController,
  type BrowserCallRuntimeOptions,
  type VoiceCallSurface,
  type VoiceBridgeEventPayload,
  type WakeWordEngineLike,
  type WakeWordSurfaceConfig,
  type WakeSurfaceStateSnapshot,
  type WakeArtifactFetcherLike,
} from './voice.js';
import {
  uploadAttachment as uploadAttachmentViaRegion,
  linkConversationAttachments,
  type UploadAttachmentResult,
  type UploadAttachmentOpts,
} from './tools/upload-attachment.js';
import {
  findChatContact,
  chatContactIdentityKeys,
  chatContactsAreSameIdentity,
  mergeContactAvatarUrl,
  applyPanelAvatarOnContactSwitch,
  resolveConversationAvatarUrl,
  indexChatContactsById,
} from './contact-identity.js';
import { SubAgentObserver } from './stream/sub-agent-observer.js';
import { SubAgentSeqTracker } from './stream/sub-agent-seq-tracker.js';
import {
  applySubAgentRunStatesToTurns,
  type SubAgentRunState,
} from './agent-runs/apply-run-states.js';
import { pendingApprovalFromPayload } from './stream/tool-events.js';
import {
  elevationCommandNames,
  isSubAgentApprovalEvent,
  permissionElevationInfoFromEvent,
} from './stream/approval-events.js';
import {
  attachmentsForCommand,
  mergeAttachmentDisplay,
} from './attachments.js';
import { createContactThreadApi, type ContactThreadApi } from './session/contact-thread-api.js';
import {
  commandFailureError,
  nexusSessionCode,
  readCommandFailureCode,
} from './session/command-failure.js';
import {
  lockedAgentAllowsContact,
  lockedAgentContact,
  lockedAgentVisibleName,
  parseLockedAgent,
  rehydrateRowsFromMessages,
  resolveDisplayAvatar,
  type LockedAgent,
} from './session/locked-agent.js';
import {
  assistantFromFallbackCompletion,
  fallbackMessagesFromTurns,
  fallbackTransportSelected,
  type FallbackChatTransport,
} from './fallback/fallback-transport.js';
import {
  ConversationAgentIndex,
  acceptLockedAgentSendConversation,
  conversationAgentNoteFromContact,
  guardLockedAgentChannel,
  resolveLockedAgentSendTarget,
} from './session/locked-agent-send.js';
import {
  listAvailableChatModels,
  type ModelsAvailableCatalog,
} from './models/available-models.js';
import { discardableUnsentTurnIds } from './outgoing/unsent-turns.js';
import {
  browserLockedThreadStorage,
  readLockedThread,
  writeLockedThread,
} from './session/locked-thread-memory.js';
import {
  ClientToolRegistry,
  buildQuestionAnswer,
  clientToolAccessOf,
  isIndexedClientTool,
  localClientToolIndexFingerprint,
  normalizePendingPauseKind,
  parsePendingPauseCard,
  type ClientToolIndexEntry,
  type PendingPauseCard,
  type PendingPauseKind,
  type PersistChoice,
  type QuestionAnswer,
} from './tools/index.js';
import { parseModeChangedEvent } from './mode-transition.js';

const lockedOpenInflight = new Map<string, Promise<{ conversationId: string; created: boolean; greetingText?: string | null }>>();
const openingRequested = new Set<string>();


export type {
  ChatTransport,
  AgentSource,
  ChatFeatures,
  ChatHooks,
  ChatSendOutcomeCode,
  ChatToolDescriptor,
  ChatClientToolAccess,
  ChatContact,
  ChatCreditsState,
  ChatBillingIssueState,
  ChatBillingIssueCode,
  ChatRoomPresence,
  ChatRoomSummary,
  ChatRoomDetail,
  ChatRoomOrchestration,
  ChatRoomLeaveAction,
  ChatRoomParticipant,
  ChatRoomParticipantAiConfig,
  ChatSpendLimitsState,
  ChatThrottleState,
  ChatUsageSnapshot,
  ChatVoiceCallSession,
  IoDescriptor,
};
export { DEFAULT_FEATURES, AI_DISCLOSURE_REQUIRED, CONTACT_BANNED_CODE } from './types.js';
export type { ChatTurn, ChatDeliveryStatus, PanelState, ChatToolRun, ChatToolRunStatus, SubAgentFinalStatus, SubAgentPendingApproval } from './state.js';
export {
  inferSupportsReasoning,
  modelSupportsToolCalling,
  isChatAgentPickerModel,
  formatCatalogModelLabel,
  resolveReasoningEffortLevels,
  NON_CHAT_AGENT_CAPABILITIES,
  NON_CHAT_AGENT_CATEGORIES,
  ALL_REASONING_EFFORT_LEVELS,
} from './model-capabilities.js';
export type { ChatPickerModelFields, ReasoningEffortLevel } from './model-capabilities.js';
export {
  listAvailableChatModels,
  mapAvailableChatModels,
  buildChatModelOverride,
} from './models/available-models.js';
export type { AvailableChatModel, ModelsAvailableCatalog } from './models/available-models.js';
export type { ChatModelOverride } from './types.js';
export { StreamEndpointResolver } from './stream/stream-endpoint-resolver.js';
export { LiveAttachSession, LIVE_ATTACH_IDLE_CHECK_MS } from './stream/live-attach.js';
export type { LiveAttachOutcome, LiveAttachResult } from './stream/live-attach.js';
export {
  parseStreamMessage,
  applyStreamEventToTurns,
  isGenerationStartStreamEvent,
  shouldDropReplayedStreamEvent,
} from './stream/stream-events.js';
export type { StreamEvent } from './stream/stream-events.js';
export { isEmptyAssistantTurn } from './stream/stream-events.js';
export {
  collapseRepeatedToolRows,
  isToolOnlyPlaceholderText,
} from './stream/rehydrate-collapse.js';
export {
  dataAccessApprovalInfoFrom,
  isDataAccessApprovalResult,
  type DataAccessApprovalInfo,
} from './stream/data-access-approval.js';
export {
  classifyChatBillingIssue,
  isChatBillingIssueCode,
} from './billing/classify-billing-issue.js';
export { pollWorkload, BrowserCallRuntime, createVoiceApi };
export type { WorkloadPollOptions, BrowserCallRuntimeOptions, VoiceCallSurface, VoiceBridgeEventPayload };
export {
  listAgentRuns,
  getAgentRun,
  pauseAgentRun,
  cancelAgentRun,
  resumeAgentRun,
  messageAgentRun,
  getAgentRunPlan,
  listAgentRunTasks,
  updateAgentRunTask,
  mapAgentRunRow,
} from './agent-runs/api.js';
export {
  applySubAgentRunStatesToTurns,
  subAgentPhaseForRunStatus,
  type SubAgentRunState,
  type SubAgentPhase,
} from './agent-runs/apply-run-states.js';
export { SubAgentObserver, isObservedEventType } from './stream/sub-agent-observer.js';
export { SubAgentSeqTracker } from './stream/sub-agent-seq-tracker.js';
export {
  permissionElevationInfoFromEvent,
  isSubAgentApprovalEvent,
  type PermissionElevationInfo,
} from './stream/approval-events.js';
export { collectSubAgentRuns, activeSubAgentCountFromTurns, visibleSubAgentStripRuns, isActiveSubAgentStripStatus } from './agent-runs/collect-runs.js';
export type {
  AgentRunOrigin,
  AgentRunStatus,
  MessageDelivery,
  AgentRunPlan,
  AgentRunPlanStep,
  AgentRunTask,
  AgentRunTaskStatus,
  AgentRunSummary,
  SubAgentStripItem,
} from './agent-runs/types.js';
export {
  mapConversationListItem,
  sessionBadgeFieldsFromSummary,
  applySessionSummaryToPanel,
  mergeSessionRowWithListItem,
} from './session/session-summary.js';
export type { ChatSessionSummary, ConversationRole } from './session/session-summary.js';
export { subscribeConversationActivity } from './session/activity-subscribe.js';
export type {
  ActivityConnectionStatus,
  ActivityEvent,
  ActivityEventData,
  ActivitySubscribeOptions,
} from './session/activity-subscribe.js';
export {
  buildContactThreadIndex,
  pickLatestOpenConversation,
  historyForContact,
  conversationBelongsToContact,
  conversationIdFromRow,
} from './session/contact-threads.js';
export type {
  ContactThreadIndexEntry,
  ConversationHistoryItem,
  ConversationRow,
} from './session/contact-threads.js';
export { createContactThreadApi } from './session/contact-thread-api.js';
export type { ContactThreadApi, CommandClientLike } from './session/contact-thread-api.js';
export {
  parseLockedAgent,
  lockedAgentVisibleName,
  threadEmptyLabel,
  humanAgentLabel,
  usableAvatarUrl,
  resolveDisplayAvatar,
  resolveConversationListMode,
  parseHighlightAgentId,
  conversationHighlightsAgent,
  filterConversationsForLockedAgent,
  CONVERSATIONS_LIST_ACCEPTS_VIRTUAL_EMPLOYEE_ID,
} from './session/locked-agent.js';
export type { ConversationListMode } from './session/locked-agent.js';
export {
  fallbackTransportSelected,
  fallbackMessagesFromTurns,
  assistantFromFallbackCompletion,
  normalizeFallbackCards,
} from './fallback/fallback-transport.js';
export type {
  FallbackChatTransport,
  FallbackChatRequest,
  FallbackChatMessage,
  FallbackChatCompletion,
  FallbackChatCard,
} from './fallback/fallback-transport.js';
export {
  sessionListPresence,
  isUnreachableLabel,
  isGrantFailureCode,
  unreachableLabelVisible,
  reduceReachLatch,
  outgoingQueueBannerText,
  shouldAutoFlushOutgoing,
  shouldHoldOutgoingForNexus,
  sessionErrorAfterFailure,
} from './outgoing/agent-reachability.js';
export type { SessionListPresence } from './outgoing/agent-reachability.js';
export { createOutgoingSendQueue, outgoingThreadKey } from './outgoing/outgoing-queue.js';
export type { OutgoingQueuedMessage, OutgoingSendQueue, OutgoingHold } from './outgoing/outgoing-queue.js';
export { flushOutgoingMessages } from './outgoing/flush-outgoing.js';
export type { OutgoingFlushSendResult } from './outgoing/flush-outgoing.js';
export {
  createOutgoingQueueMetrics,
  OUTGOING_QUEUE_METRIC,
  OUTGOING_QUEUE_OUTCOMES,
} from './outgoing/outgoing-queue.metrics.js';
export type { OutgoingQueueMetrics, OutgoingQueueOutcome } from './outgoing/outgoing-queue.metrics.js';
export { isRetryableOutgoingFailure } from './outgoing/outgoing-failure.js';
export { isDiscardableUnsentUserTurn, discardableUnsentTurnIds, latestUnsentUserTurnId } from './outgoing/unsent-turns.js';
export type { LockedAgent } from './session/locked-agent.js';
export {
  LOCKED_AGENT_SEND_ROOM,
  LOCKED_AGENT_SEND_CONVERSATION,
  LOCKED_AGENT_SEND_UNKNOWN,
} from './session/locked-agent-send.js';
export {
  createVoiceModeState,
  type VoiceLayoutMode,
  type VoiceModeState,
} from './voice/voice-mode.js';
export {
  listAudioModels,
  createSttJob,
  createAndPollStt,
  createLiveSttSession,
  connectLiveSttWebSocket,
  getSttJobResult,
  pollSttJob,
  createAndPollTts,
  playAudioUrl,
  listTtsVoices,
  ttsVoicesForPicker,
  transcribeOrNull,
  speakText,
} from './voice/stt-tts.js';
export type {
  AudioModalityFilter,
  AudioModalityTransport,
  AudioModelListItem,
  SttCreateResult,
  SttGetResult,
  SttPollOptions,
  LiveSttSession,
  LiveSttSocket,
  TtsPlaybackResult,
  TtsVoiceListItem,
  TtsVoicesListResult,
  TtsVoicePickerOption,
} from './voice/stt-tts.js';
export {
  filterSttModelsForPicker,
  findSttModel,
  modelHasSttCapability,
  modelSupportsSttStream,
} from './voice/stt-models-picker.js';
export {
  createSpeakTurnController,
  getContactTts,
  setContactTts,
  clearContactTts,
  contactTtsNeedsSetup,
} from './voice/speak-turn.js';
export type {
  ContactTtsView,
  ContactVoiceSampleRef,
  SpeakTurnPhase,
  SpeakTurnState,
  SpeakTurnController,
} from './voice/speak-turn.js';
export {
  EMPTY_CALL_STATE,
  buildCallBanner,
  isVoiceBubble,
  isPostedFromVoice,
  postedFromVoiceMarker,
  voiceSpeakerLabel,
  applyTranscriptEvent,
  mergeStoredWithLive,
  canStartCallFromRoom,
  applyChatVisibility,
  deliveredHint,
} from './voice/chat-call-surface.js';
export type {
  VoiceMessageModality,
  ChatVoiceMessageFields,
  CallInProgressState,
  CallBannerView,
  PartialTranscriptEvent,
  TranscriptMessage,
  StartCallFromRoomCheck,
} from './voice/chat-call-surface.js';
export {
  createWakeController,
  type WakeController,
  type WakeControllerDeps,
  type WakeDetectionLike,
  type WakeSurfaceState,
  type WakeSurfaceStateSnapshot,
  type WakeVoiceOpenRequest,
  type WakeWordEngineLike,
  type WakeWordSurfaceConfig,
  type WakeArtifactFetcherLike,
} from './voice/index.js';
export { formatTurnSenderLine, formatTurnTime } from './turn-meta.js';
export {
  findChatContact,
  chatContactIdentityKeys,
  chatContactsAreSameIdentity,
  mergeContactAvatarUrl,
  applyPanelAvatarOnContactSwitch,
  resolveConversationAvatarUrl,
  indexChatContactsById,
};
export {
  parseParticipantPresenceV1,
  mergeParticipantPresenceV1,
  createPresenceStore,
  readPresenceFromProfile,
  writePresenceIntoProfilePatch,
} from './presence/participant-presence.js';
export type {
  AvatarValidationStatus,
  ParticipantPresenceV1,
} from './presence/participant-presence.js';
export type { TurnSenderLineOpts } from './turn-meta.js';
export {
  waitForIceGatheringComplete,
  getBrowserRealtimeCallRuntime,
  isBrowserRealtimeCallConnected,
  destroyBrowserRealtimeCallRuntime,
  BrowserCallSession,
} from './voice.js';
export {
  mergeToolStreamEvents,
  rehydrateToolRunsFromHistory,
  patchToolRunStatus,
  normalizeToolRunStatus,
} from './stream/tool-events.js';
export {
  useModeTransition,
  formatModeTransitionCountdown,
  modeLabel,
  parseModeChangedEvent,
} from './mode-transition.js';
export type {
  ChatExecutionMode,
  ModeTransitionPhase,
  ModeTransitionState,
  ModeTransitionListener,
  ModeTransitionOptions,
  ModeTransitionController,
  ChatModeChangedEvent,
} from './mode-transition.js';
export {
  uploadAttachment,
  conversationAttachmentDescriptor,
  linkConversationWorkspaceItem,
  linkConversationAttachments,
  isUploadAbortError,
} from './tools/upload-attachment.js';
export type {
  UploadAttachmentClient,
  UploadAttachmentFile,
  UploadAttachmentResult,
  UploadAttachmentOpts,
  UploadProgressEvent,
  ChatAttachmentEncryptionTier,
} from './tools/upload-attachment.js';
export {
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
  CHAT_CONVERSATION_ATTACHMENT_TTL_MS,
  collectFilesFromClipboard,
  collectFilesFromDataTransfer,
  dataTransferHasFiles,
  ensureNamedFile,
  snapshotChatFiles,
  partitionChatAttachmentFiles,
  uploadOptsForChatFileDestination,
  looksLikeImageFile,
  extFromMime,
} from './tools/attachment-ingest.js';
export type {
  ChatFileDestination,
  ChatAttachmentRejectReason,
  ChatAttachmentFileLike,
  ChatAttachmentReject,
  ChatAttachmentRetentionPolicy,
  ChatFileUploadOpts,
} from './tools/attachment-ingest.js';
export {
  SCHEDULE_CHECK_BACK_TOOL_NAME,
  parseScheduleCheckBackResult,
  isScheduleCheckBackTool,
  checkBackWakeAtMs,
  checkBackRemainingMs,
  isCheckBackWaiting,
  isCheckBackOverdue,
  formatCheckBackCountdown,
  checkBackProgress,
  isCheckBackInProgressError,
  isCheckBackAlreadyCompletedError,
  isCheckBackNoPendingError,
  isCheckBackTriggerSettledError,
  buildStorageExplorerUrl,
  toConsoleStorageExplorerUrl,
  fileIdFromStorageExplorerUrl,
  storageConsolePrefix,
  parsePresentFileItem,
  parsePresentFileItems,
  presentFileKind,
  displayToolCallName,
  formatToolResultText,
  presentToolRunRow,
  parseMediaImages,
  parseWorkloadMediaImages,
  parseMediaAudioUrl,
  parseMediaWorkloadId,
  isWorkloadResultApiPath,
  workloadResultPathsNeedFileUrl,
  parseUserChoiceOptions,
  // Pending-pause rails (client tool / Plan-write approval / mode switch).
  normalizePendingPauseKind,
  normalizeClientToolAccess,
  parsePendingPauseCard,
  parsePendingApprovalCard,
  parsePendingModeSwitchCard,
  parsePendingClientToolCard,
  normalizePendingResumeDecision,
  // Ask card (`ask_user_choice`).
  parseUserChoiceQuestion,
  buildQuestionAnswer,
  questionAnswerIsActionable,
  userChoiceQuestionIsExpired,
  // Plan card.
  parsePlanTodos,
  summarizePlanTodos,
  parsePlanCard,
  parsePlanPointer,
  planProgressLabel,
  normalizePlanTodoStatus,
  // Precedent-used chip.
  parsePrecedentUse,
  PRECEDENT_NOT_APPLICABLE_DEFAULT_REASON,
  // Client-tool registry (pinned vs discoverable).
  ClientToolRegistry,
  clientToolAccessOf,
  clientToolAvailabilityOf,
  isIndexedClientTool,
  localClientToolIndexFingerprint,
} from './tools/index.js';
export type {
  ScheduleCheckBackResult,
  PresentFileItem,
  ToolCallNameParts,
  ToolRunRowModel,
  MediaCarouselImage,
  UserChoiceOption,
  PendingPauseKind,
  ClientToolAccess,
  PendingPauseCard,
  PendingApprovalCard,
  PendingModeSwitchCard,
  PendingClientToolCard,
  UserChoiceQuestion,
  UserChoiceQuestionOption,
  UserChoiceQuestionTarget,
  UserChoiceQuestionStatus,
  QuestionAnswer,
  PersistChoice,
  PersistScope,
  PlanTodoItem,
  PlanTodoStatus,
  PlanCard,
  PlanCardStatus,
  PlanPointer,
  PrecedentUse,
  ClientToolIndexEntry,
  ClientToolRegistration,
  ClientToolFunctionSchema,
} from './tools/index.js';

export {
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
} from './chat-chrome.js';
export type {
  ModelTier,
  HostingType,
  MentionToken,
  ActivityBarState,
  ComputeTier,
} from './chat-chrome.js';

/**
 * Plan Part C5 / C8 / C9 — pure chat-chrome card helpers, shared by every chat
 * adapter (React and Vue2) so the portal and app derive identical shapes.
 */
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
} from './chat-chrome-cards.js';
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
} from './chat-chrome-cards.js';

export const DEFAULT_I18N = {
  messageAccepted: '(message accepted)',
  awaitingResponse: 'Awaiting response...',
  replyTimedOut: 'The reply did not arrive. Try again.',
} as const;

export type SendResult =
  | { ok: true; data?: unknown; kind?: string }
  | {
      ok: false;
      kind:
        | 'sca_required'
        | 'data_access_approval_required'
        | 'permission_elevation_required'
        | 'error'
        | 'insufficient_credits'
        | 'subscription_inactive'
        | 'spending_limit'
        | 'agent_usage_limit';
      authRequestId?: string | null;
      dataAccessApproval?: unknown;
      permissionElevation?: {
        elevationId?: string | null;
        pack?: string | null;
        commandNames?: string[];
        resourceRef?: Record<string, unknown> | null;
        reason?: string | null;
        requiredOnboardingType?: string | null;
        onboardingSatisfied?: boolean;
      };
      message?: string;
      /** Partner soft-fail code, e.g. NO_NEXUS_GRANT. Distinct from `kind`. */
      code?: string;
      retryAfterMs?: number;
      lockedUntil?: string | null;
      error?: Record<string, unknown>;
    };

export type CommandClient = {
  send: (command: string, payload?: Record<string, unknown>, opts?: { requestId?: string }) => Promise<SendResult | unknown>;
};

export type ChatState = {
  panels: PanelState[];
  activePanelIndex: number;
  contacts: ChatContact[];
  rooms: ChatRoomSummary[];
  roomPresence: Record<string, ChatRoomPresence[]>;
  calls: ChatVoiceCallSession[];
  streaming: boolean;
  /** Pending client_tool_request callId (page tools); keep WS open until resume. */
  pausedCallId?: string | null;
  /** Which rail the paused turn is on (`client_tool` | `approval` | `mode_switch`). */
  pendingPauseKind?: 'client_tool' | 'approval' | 'mode_switch' | null;
  /** Typed card the paused turn renders; `null` when nothing is paused. */
  pendingPause?: PendingPauseCard | null;
  selectedAgentId: string | null;
  conversationId: string | null;
  features: ChatFeatures;
  agentSource: AgentSource;
  transport: ChatTransport;
  aiDisclosureVisible: true;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolEvents?: ChatToolRun[];
    compaction?: ChatTurn['compaction'];
    usage?: ChatTurn['usage'];
  }>;
  turns: ChatTurn[];
  history?: {
    hasMore: boolean;
    oldest: { messageId: string; createdAt: string | null } | null;
    loading: boolean;
    loadingMore: boolean;
  };
  lastDispatchSkip?: string | null;
};

type Listener = (state: ChatState) => void;

function createStore(initial: ChatState) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState: (patch: Partial<ChatState>) => {
      state = { ...state, ...patch, aiDisclosureVisible: true as const };
      listeners.forEach((l) => l(state));
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function emptyPanel(): PanelState {
  return {
    id: 'default',
    contactId: '',
    contactType: 'agent',
    conversationId: null,
    roomId: null,
    roomPurpose: 'conversation',
    turns: [],
    streaming: false,
    queuedMessages: [],
    unreadCount: 0,
    usage: null,
    spendLimits: null,
    throttle: null,
    credits: null,
    billingIssue: null,
    presence: [],
    activeCall: null,
    pausedCallId: null,
  };
}

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

function currentPanel(state: ChatState): PanelState | null {
  return state.panels[state.activePanelIndex] || null;
}

function usageFromData(data: Record<string, unknown>): ChatUsageSnapshot | null {
  const hasUsage =
    typeof data.tokensUsed === 'number' ||
    typeof data.maxContextTokens === 'number' ||
    typeof data.costCents === 'number' ||
    typeof data.creditsCents === 'number' ||
    typeof data.displayCostMinor === 'number' ||
    typeof data.creditsChargedCents === 'number' ||
    data.contextSnapshot != null;
  if (!hasUsage) return null;
  return {
    tokensUsed: typeof data.tokensUsed === 'number' ? data.tokensUsed : undefined,
    maxContextTokens: typeof data.maxContextTokens === 'number' ? data.maxContextTokens : undefined,
    costCents: typeof data.costCents === 'number' ? data.costCents : undefined,
    creditsCents: typeof data.creditsCents === 'number' ? data.creditsCents : undefined,
    displayCostMinor:
      typeof data.displayCostMinor === 'number' ? data.displayCostMinor : undefined,
    displayCurrency:
      typeof data.displayCurrency === 'string' && data.displayCurrency.trim()
        ? data.displayCurrency.trim().toUpperCase()
        : undefined,
    billingMode:
      typeof data.billingMode === 'string' && data.billingMode.trim()
        ? data.billingMode.trim()
        : undefined,
    creditsChargedCents:
      typeof data.creditsChargedCents === 'number' ? data.creditsChargedCents : undefined,
    contextSnapshot: data.contextSnapshot,
  };
}

function throttleFromFailure(result: Extract<SendResult, { ok: false }>): ChatThrottleState | null {
  const billing = classifyChatBillingIssue({
    kind: result.kind,
    code: result.error?.code,
    message: result.message || result.error?.code,
  });
  const insufficient =
    Boolean(billing) ||
    result.kind === 'insufficient_credits' ||
    /insufficient.*credit/i.test(String(result.message || result.error?.code || ''));
  if (typeof result.retryAfterMs !== 'number' && !result.lockedUntil && !insufficient) return null;
  return {
    retryAfterMs: typeof result.retryAfterMs === 'number' ? result.retryAfterMs : undefined,
    remainingMs: typeof result.retryAfterMs === 'number' ? result.retryAfterMs : undefined,
    lockedUntil: result.lockedUntil ?? null,
    reason:
      result.message ??
      (billing?.code ? billing.code.toLowerCase() : insufficient ? 'insufficient_credits' : null),
  };
}

function billingPatchFromIssue(issue: ChatBillingIssueState | null): Partial<PanelState> {
  if (!issue) return {};
  const zerosCredits =
    issue.code === 'INSUFFICIENT_CREDITS' || issue.code === 'CREDIT_DISPATCH_SUSPENDED';
  return {
    billingIssue: issue,
    ...(zerosCredits
      ? {
          credits: {
            availableCents: 0,
            usedCents: null,
            billingMode: 'credits',
          },
        }
      : {}),
    ...(issue.code === 'SPENDING_LIMIT' || issue.code === 'AGENT_USAGE_LIMIT'
      ? {
          spendLimits: {
            reached: true,
            scope: issue.code === 'AGENT_USAGE_LIMIT' ? 'agent' : 'spend',
          },
        }
      : {}),
  };
}

function mapHumanContacts(rows: unknown[]): ChatContact[] {
  return rows
    .map((row: any) => {
      const peer = row?.peer || {};
      const id = String(peer?.contactUserId || peer?.userId || peer?.id || row?.id || '');
      if (!id) return null;
      const aliases = [peer?.userId, peer?.id, row?.id]
        .map((v) => (v == null ? '' : String(v)))
        .filter((v) => v && v !== id);
      const avatarUrl = row?.avatarUrl || peer?.avatarUrl || peer?.profilePicture || null;
      return {
        id,
        name: String(row?.displayName || peer?.displayName || peer?.name || 'Contact'),
        type: 'user' as const,
        unreadCount: Number(row?.unreadCount || 0) || undefined,
        avatarUrl: avatarUrl ? String(avatarUrl) : null,
        aliases: aliases.length ? Array.from(new Set(aliases)) : undefined,
      };
    })
    .filter(Boolean) as ChatContact[];
}

function mapAssetAgentContacts(rows: unknown[]): ChatContact[] {
  return rows
    .map((row: any) => {
      const assetId = String(row?.assetId || '').trim();
      const assetAgentKey = String(row?.assetAgentKey || row?.agentKey || '').trim();
      if (!assetId || !assetAgentKey) return null;
      const id = String(row?.id || `${assetId}:${assetAgentKey}`);
      return {
        id,
        name: String(row?.name || assetAgentKey),
        type: 'asset_agent' as const,
        assetId,
        assetAgentKey,
        assetName: row?.assetName != null ? String(row.assetName) : assetId,
        relation: row?.relation === 'operator' ? 'operator' : row?.relation === 'owner' ? 'owner' : null,
      };
    })
    .filter(Boolean) as ChatContact[];
}

function isFetchableAvatarUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const v = value.trim();
  if (v.startsWith('data:')) return false;
  return /^(https?:\/\/|\/|blob:)/i.test(v);
}

function isRelativePublicFilePath(value: unknown): boolean {
  return typeof value === 'string' && /^\/public-files(\/|\?|$)/i.test(value.trim());
}

function isVeMediaHttpPath(value: unknown): boolean {
  return typeof value === 'string' && /^\/ai-agents\/ve\/[^/]+\/(avatar|avatar3d)(\?|$)/i.test(value.trim());
}

/** Prefix relative region paths with gateway base when configured. */
export function absolutizeAvatarUrl(
  value: string | null | undefined,
  publicFilesBaseUrl?: string | null,
): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (/^(https?:\/\/|blob:|data:)/i.test(v)) return v;
  if (!v.startsWith('/')) return v;
  const base = String(publicFilesBaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) return v;
  return `${base}${v}`;
}

function avatarFromVeRow(
  row: any,
  publicFilesBaseUrl?: string | null,
): { avatarUrl: string | null; avatarRef: ChatContact['avatarRef'] } {
  const ref = row?.profilePictureRef;
  if (ref && typeof ref === 'object' && typeof ref.kind === 'string') {
    const avatarRef = {
      kind: String(ref.kind),
      value: typeof ref.value === 'string' ? ref.value : undefined,
      fileId: typeof ref.fileId === 'string' ? ref.fileId : undefined,
      slot: typeof ref.slot === 'string' ? ref.slot : 'profilePicture',
    };
    // Relative /public-files → hydrate via media.get (may need signed URL).
    if (avatarRef.kind === 'url' && isRelativePublicFilePath(avatarRef.value)) {
      return {
        avatarUrl: null,
        avatarRef: { ...avatarRef, kind: 'deferred' },
      };
    }
    if (avatarRef.kind === 'deferred') {
      return { avatarUrl: null, avatarRef };
    }
    const rawUrl =
      avatarRef.kind === 'url' && isFetchableAvatarUrl(avatarRef.value) ? String(avatarRef.value) : null;
    // Immediate-bind absolute http(s)/blob and /ai-agents/ve/... media paths.
    const avatarUrl =
      rawUrl && /^https?:\/\//i.test(rawUrl)
        ? absolutizeAvatarUrl(rawUrl, publicFilesBaseUrl)
        : rawUrl && rawUrl.startsWith('blob:')
          ? rawUrl
          : rawUrl && isVeMediaHttpPath(rawUrl)
            ? absolutizeAvatarUrl(rawUrl, publicFilesBaseUrl)
            : null;
    if (rawUrl && !avatarUrl) {
      return {
        avatarUrl: null,
        avatarRef: { ...avatarRef, kind: 'deferred' },
      };
    }
    return { avatarUrl, avatarRef };
  }
  const raw = row?.profilePicture || row?.avatarUrl || row?.avatar || row?.imageUrl || null;
  if (typeof raw === 'string' && isRelativePublicFilePath(raw)) {
    return { avatarUrl: null, avatarRef: { kind: 'deferred', slot: 'profilePicture', value: raw } };
  }
  if (typeof raw === 'string' && isVeMediaHttpPath(raw)) {
    return {
      avatarUrl: absolutizeAvatarUrl(raw, publicFilesBaseUrl),
      avatarRef: { kind: 'url', value: raw, slot: 'profilePicture' },
    };
  }
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw.trim())) {
    return {
      avatarUrl: absolutizeAvatarUrl(raw, publicFilesBaseUrl),
      avatarRef: { kind: 'url', value: raw, slot: 'profilePicture' },
    };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { avatarUrl: null, avatarRef: { kind: 'deferred', slot: 'profilePicture' } };
  }
  return { avatarUrl: null, avatarRef: null };
}

function mapVeAgents(
  rows: unknown[],
  opts?: { canConfigure?: boolean; publicFilesBaseUrl?: string | null },
): ChatContact[] {
  return rows
    .map((row: any, i: number) => {
      const employeeId = String(row?.employeeId || '').trim();
      const mongoId = String(row?._id || row?.id || '').trim();
      const id = employeeId || mongoId || `ve_${i}`;
      if (!id) return null;
      const aliases = [mongoId, employeeId, row?.virtualEmployeeId, row?.agentId]
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter((v) => v && v !== id);
      const { avatarUrl, avatarRef } = avatarFromVeRow(row, opts?.publicFilesBaseUrl);
      return {
        id,
        name: String(row?.name || row?.title || row?.publicRole || 'Agent'),
        type: 'agent' as const,
        virtualEmployeeId: employeeId || id,
        agentId: row?.agentId ? String(row.agentId) : null,
        contactStatus:
          row?.contactStatus === 'available' ||
          row?.contactStatus === 'away' ||
          row?.contactStatus === 'disabled'
            ? row.contactStatus
            : row?.availability?.status === 'offline'
              ? 'disabled'
              : row?.availability?.status === 'away'
                ? 'away'
                : row?.availability?.available === false
                  ? 'away'
                  : null,
        avatarUrl,
        avatarRef,
        aliases: aliases.length ? Array.from(new Set(aliases)) : undefined,
        canConfigure: opts?.canConfigure === true,
        responsibleUserId: row?.responsibleUserId ? String(row.responsibleUserId) : null,
        orgId: row?.orgId ? String(row.orgId) : null,
        scope:
          row?.scope === 'global' || row?.scope === 'org' || row?.scope === 'user'
            ? row.scope
            : null,
      };
    })
    .filter(Boolean) as ChatContact[];
}

async function hydrateAgentAvatars(
  contacts: ChatContact[],
  client: CommandClient,
  publicFilesBaseUrl?: string | null,
): Promise<ChatContact[]> {
  const pending = contacts.filter(
    (c) => c.type === 'agent' && !c.avatarUrl && c.avatarRef?.kind === 'deferred',
  );
  if (!pending.length) return contacts;

  const srcById = new Map<string, string>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const idx = cursor;
      cursor += 1;
      const contact = pending[idx];
      const id = contact.virtualEmployeeId || contact.id;
      try {
        const result = await client.send('anx.ai-agents.virtual-employees.media.get', {
          id,
          slot: contact.avatarRef?.slot || 'profilePicture',
        });
        if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
          continue;
        }
        const data = unwrapData(result);
        const media =
          data.media && typeof data.media === 'object'
            ? (data.media as Record<string, unknown>)
            : data;
        const src = typeof media.src === 'string' ? media.src : null;
        if (src && (isFetchableAvatarUrl(src) || src.startsWith('data:image/'))) {
          const resolved = src.startsWith('data:')
            ? src
            : absolutizeAvatarUrl(src, publicFilesBaseUrl) || src;
          srcById.set(contact.id, resolved);
        }
      } catch {
        // Avatar hydrate must not fail the contacts list.
      }
    }
  };
  const n = Math.min(4, pending.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  if (!srcById.size) return contacts;
  return contacts.map((c) => (srcById.has(c.id) ? { ...c, avatarUrl: srcById.get(c.id) || null } : c));
}

export type AiDispatchSummary = {
  responders?: Array<{ participantType?: string; participantId?: string }>;
  skippedReason?: string | null;
};

export type SendMessageResult =
  | {
      ok: true;
      aiDispatch?: AiDispatchSummary | null;
      dispatched?: boolean;
      transport?: 'fallback';
      greetingText?: string;
    }
  | { ok: false; code: string; message: string; kind?: string; localTurnId?: string };

function readAiDispatch(data: Record<string, unknown>): AiDispatchSummary | null {
  const raw = data.aiDispatch;
  if (!raw || typeof raw !== 'object') return null;
  return raw as AiDispatchSummary;
}

function emitSendOutcome(hooks: ChatHooks | undefined, code: ChatSendOutcomeCode): void {
  try {
    hooks?.onSendOutcome?.(code);
  } catch {
    // Host hooks must not break send flow.
  }
}

function warnNexusSession(
  logger: { warn?: Function } | undefined,
  failure: unknown,
  command: string,
): string | undefined {
  const code = nexusSessionCode(readCommandFailureCode(failure));
  if (!code) return undefined;
  logger?.warn?.('nexus_session_required', { code, command });
  return code;
}

export type ConversationSummaryTopic = {
  label: string;
  salience: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type ConversationSummaryTodo = {
  text: string;
  status: 'open' | 'done' | 'dropped';
  dueAt: string | null;
  sourceMessageId: string | null;
};

export type ConversationSummaryResult = {
  conversationId: string;
  structuredSummary: {
    topics: ConversationSummaryTopic[];
    todos: ConversationSummaryTodo[];
    updatedAt: string | null;
    sourceCompactionEventId: string | null;
  } | null;
};

/**
 * Host-supplied page tools for the open screen.
 *
 * This is the SDK rail the portal page-agent, the ANX app webview, and partner
 * embeds share. `schemas()` is injected on every chat send as
 * `browserFunctionCalls`; when the model calls one the turn pauses and
 * `execute` runs on the host, then the turn resumes via `resumeClientTool`.
 *
 * `canExecute` must return true for any name `execute` can handle — including
 * tools the model learned mid-turn from `anx.page.understand`
 * (`extraFunctionSchemas`), so those are caught instead of falling through to
 * `hooks.onClientToolRequest`.
 *
 * `pointer` is optional page identity (path, tiny prompt, entity ref) attached
 * to a send only when the caller did not set those fields.
 */
export type PageToolSchema = {
  name: string;
  description?: string;
  parameters?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type PageToolPointer = {
  path?: string;
  prompt?: string;
  entityRef?: {
    type: string;
    id?: string | null;
    name?: string | null;
    saved?: boolean;
  };
};

export type PageToolExecuteContext = {
  /** Conversation the paused turn belongs to, when known. */
  conversationId?: string | null;
};

export type PageToolSource = {
  /** Schemas injected on every send (merged with `registerTool`). */
  schemas: () => PageToolSchema[];
  /** True when `execute` can handle `name` (generic, pack, or understood tool). */
  canExecute: (name: string) => boolean;
  /** Run one page tool on the host; the result is sent as the client-tool result. */
  execute: (
    name: string,
    args: Record<string, unknown>,
    context: PageToolExecuteContext,
  ) => Promise<unknown> | unknown;
  /**
   * Optional: runs after the result reached region and the turn resumed. Use it
   * for follow-ups that must not race the resume (e.g. a navigate-arrival ping).
   */
  afterResult?: (
    result: unknown,
    context: PageToolExecuteContext,
  ) => void | Promise<void>;
  /** Optional current-page pointer for path / tiny prompt / entity ref. */
  pointer?: () => PageToolPointer | null | undefined;
};

/**
 * Resolution order for a paused client tool: registered tool (via `registerTool`
 * or `tools`) wins on name, then a page tool the host can execute, then
 * undefined so the caller falls through to `hooks.onClientToolRequest`.
 */
export function selectClientToolHandler(
  name: string,
  registered: Map<string, { descriptor: ChatToolDescriptor; handler: (args: unknown) => unknown }>,
  pageTools: PageToolSource | null | undefined,
): ((args: Record<string, unknown>, context: PageToolExecuteContext) => unknown) | undefined {
  const entry = registered.get(name);
  if (entry) return (args) => entry.handler(args);
  if (pageTools?.canExecute?.(name)) return (args, context) => pageTools.execute(name, args, context);
  return undefined;
}

export type NexusChat = {
  getState: () => ChatState;
  subscribe: (listener: Listener) => () => void;
  /** Get structured summary (topics + todos) for a conversation. */
  getConversationSummary: (conversationId: string) => Promise<ConversationSummaryResult>;
  /**
   * Host page context for later sends. Pass null to clear it.
   * A context brain may call this with the same fields.
   */
  setHostPageContext: (next: HostPageContext | null) => void;
  /**
   * Plan Part C11 — opt-in app route/screen context, mirroring the portal
   * `browserContext` pattern. Structure-only; never carries field values,
   * credentials, or message bodies. Pass null to opt out / clear.
   */
  setAppRouteContext: (next: AppRouteContext | null) => void;
  sendMessage: (
    text: string,
    opts?: {
      conversationId?: string;
      contactId?: string;
      roomId?: string;
      attachments?: IoDescriptor[];
      modelOverride?: import('./types').ChatModelOverride;
      reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
      uiLocale?: string;
      currentPagePath?: string;
      injectedSystemPrompts?: string[];
      /**
       * Host page context. Optional. When `projectId` is set, project-scoped
       * tools use it. A context brain may set the same fields later.
       */
      pageContext?: HostPageContext;
      pageEntityRef?: {
        type: string;
        id?: string | null;
        name?: string | null;
        saved?: boolean;
      };
      pageInstructions?: string;
      pageData?: Record<string, unknown>;
      browserContext?: Record<string, unknown>;
      browserFunctionCalls?: Array<{
        name: string;
        description: string;
        parameters: {
          type: string;
          properties?: Record<string, unknown>;
          required?: string[];
        };
      }>;
      pageFunctionCalls?: string[];
      /**
       * Compact index of discoverable client tools for this turn. Defaults to the
       * registry's discoverable tools; pass `[]` to send none.
       */
      clientToolIndex?: ClientToolIndexEntry[];
      /**
       * Hash of an index already sent this conversation. When the registry is
       * unchanged, the SDK sends this instead of the full index; the server reads
       * it back from its conversation cache. The SDK fills this automatically —
       * pass it only to force a specific server-issued hash.
       */
      clientToolIndexHash?: string;
      /**
       * Structured answer to the open `ask_user_choice` question. When present the
       * server validates it against the stored question and replaces `text`.
       */
      questionAnswer?: QuestionAnswer;
      /**
       * Send on the Nexus command path even when the host fallback flag is set.
       * Used when the session list would show the agent online.
       */
      bypassFallback?: boolean;
      /** Empty thread: ask the agent to greet. Do not show a user turn. */
      conversationOpen?: boolean;
    },
  ) => Promise<SendMessageResult>;
  /** Compact conversation context via anx.communicate.conversations.compact. */
  compactConversation: (opts: {
    conversationId: string;
    compactPreserveIds?: string[];
  }) => Promise<{ conversationId: string; compacted: boolean }>;
  /** Cancel in-flight generation via anx.communicate.conversations.cancel. */
  cancelConversation: (opts: {
    conversationId: string;
  }) => Promise<{ cancelled: boolean; generationInProgress: boolean }>;
  /**
   * Re-attach to a server-side generation that is still running (page reload,
   * navigating back to the conversation). Replays the in-flight turn from the
   * stream replay buffer, keeps `streaming=true` (so Cancel stays visible) and
   * resolves once the attach settles. Call after history was rehydrated.
   */
  attachLiveGeneration: (opts: { conversationId: string }) => Promise<LiveAttachResult>;
  /** Close an attach-owned stream (panel closed). A send-owned stream is left alone. */
  detachLiveGeneration: () => void;
  /**
   * Fold server-side AgentRun state (`anx.inference.workloads.list` with
   * `parentConversationId`) into `run_sub_agent` rows: phase, pending approval,
   * linked chat. Returns true when any row changed.
   */
  applySubAgentRunStates: (runs: SubAgentRunState[]) => boolean;
  /** Same, from a user-inbox `activity` payload (kind `sub_agent`) for the open conversation. */
  applySubAgentActivity: (data: unknown) => boolean;
  /**
   * Keep a passive stream subscription while background sub-agents of this
   * conversation are live and no send / live-attach socket is open (null stops).
   * Delivers widget live output, sub-agent approval requests and hands a new
   * parent generation to `onObservedGenerationStart` / `attachLiveGeneration`.
   */
  observeSubAgents: (opts: { conversationId: string | null }) => void;
  loadContacts: () => Promise<void>;
  /** Entitled chat catalog via existing `anx.inference.models.available`. */
  listAvailableModels: (input?: {
    agentId?: string;
    category?: string;
    role?: 'owner' | 'orgMember' | 'public';
  }) => Promise<ModelsAvailableCatalog>;
  /** Create a new conversation for an agent contact (VE id or agent id). Always allocates a new id. */
  openContact: (contactId: string, opts?: { title?: string }) => Promise<{ conversationId: string; agentId?: string }>;
  listConversations: ContactThreadApi['listConversations'];
  listMessages: ContactThreadApi['listMessages'];
  archiveConversation: ContactThreadApi['archiveConversation'];
  reopenConversation: ContactThreadApi['reopenConversation'];
  deleteConversation: ContactThreadApi['deleteConversation'];
  openLatest: ContactThreadApi['openLatest'];
  resetConversation: ContactThreadApi['resetConversation'];
  history: ContactThreadApi['history'];
  streamInit: (opts: { conversationId?: string; contactId?: string; roomId?: string }) => Promise<void>;
  /** True while this controller holds an open/connecting conversation WebSocket. */
  hasLiveStream: () => boolean;
  /**
   * Remove local optimistic user rows that never reached the server.
   * Sent rows and server history (no deliveryStatus) are left in place.
   */
  discardLocalUnsentTurns: (turnIds: string[]) => string[];
  listRooms: () => Promise<ChatRoomSummary[]>;
  createRoom: (input: {
    title?: string;
    type?: 'dm' | 'group';
    encryptionMode?: 'server_group_v1' | 'client_v1';
    participants?: Array<{
      type: 'user' | 'agent' | 'virtual_agent' | 'asset_agent';
      id: string;
      role?: string;
      displayName?: string;
      assetAgentKey?: string;
    }>;
    /** AI contacts to add after create (`agent` / `virtual_agent` / `asset_agent`). */
    aiParticipants?: Array<{
      type: 'agent' | 'virtual_agent' | 'asset_agent';
      id: string;
      displayName?: string;
      assetAgentKey?: string;
    }>;
    /** Disappearing-message TTL in seconds; null disables. Default applied by backend when omitted. */
    messageTtlSeconds?: number | null;
  }) => Promise<{ roomId: string }>;
  updateRoom: (input: { roomId: string; name?: string | null }) => Promise<{
    roomId: string;
    name: string | null;
    type?: string;
  }>;
  getRoom: (roomId: string) => Promise<ChatRoomDetail>;
  addRoomParticipant: (input: {
    roomId: string;
    participant: {
      type: 'user' | 'agent' | 'virtual_agent' | 'asset_agent';
      id: string;
      role?: string;
      displayName?: string;
      assetAgentKey?: string;
    };
  }) => Promise<unknown>;
  getRoomBillingSummary: (roomId: string) => Promise<Record<string, unknown>>;
  leaveRoom: (input: {
    roomId: string;
    action: ChatRoomLeaveAction;
    newOwnerUserId?: string;
  }) => Promise<{
    ok: boolean;
    left?: boolean;
    archived?: boolean;
    transferredTo?: string;
    roomId?: string;
  }>;
  sendRoomMessage: (roomId: string, text: string) => Promise<unknown>;
  removeRoomParticipant: (input: {
    roomId: string;
    participantId: string;
    participantType?: string;
  }) => Promise<unknown>;
  updateRoomOrchestration: (input: {
    roomId: string;
    /** Flat orchestration fields (matches backend Zod — not nested under `orchestration`). */
    defaultAiResponseMode?: 'mention_only' | 'always';
    maxAgentTurnsLimit?: number;
    maxAiOnlyChainLength?: number;
    maxAutoBurstCreditsCents?: number | null;
    autoChatStyle?: 'efficient' | 'story' | 'mixed';
    roomRules?: string[];
    mentionInfoBubbleDismissed?: boolean;
    /** @deprecated Prefer flat fields; still accepted and flattened. */
    orchestration?: Record<string, unknown>;
  }) => Promise<unknown>;
  createRoomInvite: (input: {
    roomId: string;
    expiresInMs?: number;
    maxUses?: number;
  }) => Promise<{ inviteCode: string; expiresAt?: string }>;
  setRoomRetention: (input: {
    roomId: string;
    messageTtlSeconds: number | null;
  }) => Promise<{ roomId: string; messageTtlSeconds: number | null }>;
  redeemRoomInvite: (input: {
    inviteCode: string;
  }) => Promise<{ roomId: string; joined: boolean }>;
  upgradeRoomEncryption: (input: {
    roomId: string;
    targetMode: string;
  }) => Promise<{ roomId: string; encryptionMode: string }>;
  downgradeRoomEncryption: (input: {
    roomId: string;
    targetMode: string;
  }) => Promise<{ roomId: string; encryptionMode: string }>;
  upsertAiParticipant: (input: {
    roomId: string;
    participantType?: 'agent' | 'virtual_agent';
    participantId?: string;
    modelId?: string | null;
    responseMode?: 'mention_only' | 'always' | null;
    compactBeforeReply?: boolean;
    /** @deprecated Prefer flat participantType/participantId fields matching backend. */
    participant?: {
      type: 'agent' | 'virtual_agent';
      id: string;
      displayName?: string;
      config?: Record<string, unknown>;
    };
  }) => Promise<unknown>;
  updateRoomPresence: (presence: ChatRoomPresence) => void;
  pollWorkload: (workloadId: string, opts?: WorkloadPollOptions) => Promise<Record<string, unknown>>;
  createBrowserCall: (
    agentId: string,
    conversationId?: string | null,
    roomId?: string | null,
  ) => Promise<ChatVoiceCallSession>;
  /** Full WebRTC browser call: create → getUserMedia → offer → realtime.call.create → answer. */
  startBrowserCall: (input: {
    agentId: string;
    conversationId?: string | null;
    virtualAgentId?: string | null;
    /** Part D item 29 — start the call from a running group room. */
    roomId?: string | null;
    pageContext?: Record<string, unknown>;
    instructions?: string;
  }) => Promise<ChatVoiceCallSession>;
  createOutboundCall: (input: {
    agentId: string;
    conversationId?: string | null;
    virtualAgentId?: string | null;
    continueConversation?: boolean;
  }) => Promise<ChatVoiceCallSession>;
  prepareInboundCall: (agentId: string) => Promise<ChatVoiceCallSession>;
  getVoiceChannel: (agentId: string) => Promise<Record<string, unknown> | null>;
  getActiveVoiceCall: (
    agentId: string,
    virtualAgentId?: string | null,
  ) => Promise<Record<string, unknown> | null>;
  createRealtimeCall: (input: {
    agentId: string;
    callSid: string;
    sdp: string;
    conversationId?: string | null;
    virtualAgentId?: string | null;
    pageContext?: Record<string, unknown>;
    instructions?: string;
  }) => Promise<Record<string, unknown>>;
  createLiveSttSession: (input?: { bookId?: string; modelId?: string }) => Promise<Record<string, unknown>>;
  /** Connect to the live STT WebSocket for streaming transcription. */
  connectLiveSttWebSocket: (params: {
    wsUrl: string;
    token: string;
    onPartial?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (error: string) => void;
    onClosed?: () => void;
  }) => {
    send: (audioFrame: ArrayBuffer | Uint8Array) => void;
    close: () => void;
  };
  appendVoiceEvent: (payload: VoiceBridgeEventPayload & { callSid: string }) => Promise<Record<string, unknown>>;
  injectCallText: (input: {
    agentId: string;
    callSid: string;
    text: string;
    conversationId?: string | null;
  }) => Promise<Record<string, unknown>>;
  endVoiceCall: (input: { agentId: string; callSid: string }) => Promise<boolean>;
  endCall: (input: { agentId: string; callSid: string }) => Promise<boolean>;
  getVoiceSurface: () => VoiceCallSurface;
  /**
   * Plan Part W2 — idle wake-word surface. `configureWake` installs the agent
   * config + on-device engine; `optInWake` arms listening only while the surface
   * is open and unlocked. A wake can ONLY open the voice session.
   */
  configureWake: (
    config: WakeWordSurfaceConfig | null | undefined,
    engine?: WakeWordEngineLike | null,
  ) => void;
  getWakeState: () => WakeSurfaceStateSnapshot;
  subscribeWakeState: (listener: (snapshot: WakeSurfaceStateSnapshot) => void) => () => void;
  setWakeAgentId: (agentId: string | null) => void;
  optInWake: () => Promise<boolean>;
  optOutWake: () => void;
  setWakeSurfaceOpen: (open: boolean) => void;
  /** Plan Part W3 — mobile app-lock gate for `requireUnlocked`. */
  setWakeUnlocked: (unlocked: boolean) => void;
  refreshWake: () => Promise<boolean>;
  /** WebRTC remote audio for lip-sync (analysis). */
  subscribeRemotePlaybackStream: (
    handler: import('./voice/types.js').PlaybackStreamHandler,
  ) => () => void;
  getRemotePlaybackStream: () => MediaStream | null;
  /** TTS speak-turn controller with optional lip-sync MediaStream callback. */
  createSpeakTurn: (opts: {
    agentId?: string | null;
    virtualAgentId?: string | null;
    fallbackModelId?: string | null;
    onPlaybackStream?: (
      stream: MediaStream | null,
      audioContext: AudioContext | null,
    ) => void;
  }) => import('./voice/speak-turn.js').SpeakTurnController;
  reattachVoice: (agentId?: string | null) => boolean;
  toggleMute: () => boolean;
  pauseCall: () => void;
  resumeCall: () => void;
  pauseOrResumeCall: () => void;
  /** Region billing signal only (sidecar has empty allowed2faAliases). */
  signalBillingCredits: (availableCents: number | null | undefined) => void;
  approveTool: (opts: { approvalId: string; callId?: string }) => Promise<boolean>;
  revertTool: (opts: { approvalId: string; callId?: string }) => Promise<boolean>;
  /** Fire pending schedule_check_back via anx.communicate.check-back.trigger */
  triggerCheckBack: (conversationId: string) => Promise<{
    triggered: true;
    status: 'scheduled' | 'processing' | 'completed' | string;
  }>;
  /**
   * Mark the last use of a precedent in this conversation as not applicable
   * ("Not applicable" on the precedent chip). Sends
   * `anx.inference.decisions.false-positive.mark` with the reason; the server
   * resolves the most recent use in this conversation when no usage id is given.
   */
  markPrecedentNotApplicable: (opts: {
    decisionId: string;
    reason: string;
    usageRefId?: string;
    conversationId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  rehydrateTurns: (
    rows: Array<{
      id?: string;
      role: string;
      content?: string;
      text?: string;
      toolCalls?: Array<Record<string, unknown>>;
      attachments?: IoDescriptor[];
      createdAt?: string | null;
      senderId?: string | null;
      senderName?: string | null;
    }>,
    opts?: {
      conversationId?: string | null;
      roomId?: string | null;
      detachStream?: boolean;
      history?: {
        hasMore?: boolean;
        oldest?: { messageId: string; createdAt: string | null } | null;
      };
    },
  ) => void;
  prependTurns: (
    rows: Array<{
      id?: string;
      role: string;
      content?: string;
      text?: string;
      toolCalls?: Array<Record<string, unknown>>;
      attachments?: IoDescriptor[];
      createdAt?: string | null;
      senderId?: string | null;
      senderName?: string | null;
    }>,
    opts?: {
      hasMore?: boolean;
      oldest?: { messageId: string; createdAt: string | null } | null;
    },
  ) => void;
  /** Apply persisted conversation usage / context snapshot (e.g. from conversations.get). */
  applyUsage: (usage: ChatUsageSnapshot | null | undefined) => void;
  /** Region presign+register upload; returns region fileId as conversation_attachment ref. */
  uploadAttachment: (
    file: File | Blob | Parameters<typeof uploadAttachmentViaRegion>[1],
    opts?: UploadAttachmentOpts,
  ) => Promise<UploadAttachmentResult>;
  registerTool: (descriptor: ChatToolDescriptor, handler: (args: unknown) => Promise<unknown> | unknown) => void;
  /**
   * Register a client tool in the shared registry. `availability: 'discoverable'`
   * keeps its schema off the wire (only the index rides along) and binds on demand.
   * A blank name or a non-function handler is ignored.
   */
  registerClientTool: (input: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
    access?: 'read' | 'write';
    availability?: 'pinned' | 'discoverable';
    handler: (args: unknown) => Promise<unknown> | unknown;
  }) => void;
  /** Current discoverable client tools as the compact index sent with a message. */
  getClientToolIndex: () => ClientToolIndexEntry[];
  /**
   * Swap the page-tool source for the open screen without rebuilding chat.
   * Pass null to clear it (e.g. when leaving a page that had tools).
   */
  setPageTools: (source: PageToolSource | null) => void;
  /**
   * Resume after `onClientToolRequest`. Sends `anx.communicate.client-tool.result`
   * and streams the continued turn over the conversation WebSocket.
   */
  resumeClientTool: (opts: {
    callId: string;
    result: unknown;
    conversationId?: string;
  }) => Promise<{ ok: boolean; message?: string; code?: string }>;
  /**
   * Resume an `approval` pause: one click on the preview card. `approved` mints
   * the server-side execution marker and re-runs the gated command; passing
   * `switchToMode: 'agent'` tells the model to continue in Agent mode instead.
   */
  resolveApproval: (opts: {
    callId: string;
    approved: boolean;
    switchToMode?: 'agent' | 'plan' | 'ask';
    conversationId?: string;
  }) => Promise<{ ok: boolean; message?: string; code?: string }>;
  /**
   * Resume a `mode_switch` pause. The server applies the switch and emits
   * `mode_changed` (hosts update their chip from that hook, never by
   * re-dispatching `set-chat-mode`).
   */
  resolveModeSwitch: (opts: {
    callId: string;
    approved: boolean;
    to?: 'agent' | 'plan' | 'ask';
    conversationId?: string;
  }) => Promise<{ ok: boolean; message?: string; code?: string }>;
  /** Answer the open `ask_user_choice` question (structured, validated server-side). */
  answerQuestion: (opts: {
    questionId: string;
    selectedIds?: string[];
    customText?: string | null;
    explanation?: string | null;
    persist?: PersistChoice | null;
    conversationId?: string;
  }) => Promise<SendMessageResult>;
  /** Typed card the paused turn is showing, or null. */
  getPendingPause: () => PendingPauseCard | null;
  /**
   * Seed the pending-pause rail from a reload (`anx.communicate.conversations.get`
   * `pendingPause`). The stream only sets the card on a live pause, so a host
   * that re-attaches after a refresh restores the same card here — pass null
   * once the resolved card is dismissed. Does not touch a live generation.
   */
  seedPendingPause: (card: PendingPauseCard | null) => void;
  features: ChatFeatures;
  /** Set when this controller may talk to only one virtual employee. */
  lockedAgent: LockedAgent | null;
  /**
   * Resolves after the locked agent conversation is opened or created.
   * Null when `lockedAgent` was not set. Rejects if that open fails.
   */
  whenLockedAgentReady: Promise<{ conversationId: string; created: boolean } | null>;
  streamResolver: StreamEndpointResolver;
};

export type CreateNexusChatOptions = {
  client: CommandClient;
  transport?: ChatTransport;
  agentSource?: AgentSource;
  features?: Partial<ChatFeatures>;
  /**
   * Talk only to this virtual employee. Skips the contact directory and rooms,
   * filters conversation lists to that agent, and opens or creates the thread
   * on start. Voice, attachments, approvals, and execution modes stay available.
   */
  lockedAgent?: LockedAgent | null;
  hooks?: ChatHooks;
  i18n?: Record<string, string>;
  logger?: { debug?: Function; error?: Function; warn?: Function };
  /**
   * When the live socket is down, poll messages.list for an assistant row
   * that was not in the pre-send snapshot. Defaults: 500ms × 20.
   */
  replyPoll?: { intervalMs?: number; maxAttempts?: number };
  /**
   * Region/gateway origin used to absolutize relative `/public-files/...`
   * and `/ai-agents/ve/...` avatar URLs (portal and region are different origins in local/dev).
   */
  publicFilesBaseUrl?: string | null;
  /**
   * OpenAI-like completion used when the host says Nexus is unavailable.
   * The library does not call Nexus commands on that path.
   */
  fallbackTransport?: FallbackChatTransport | null;
  /**
   * Plan Part W2 — on-device wake engine injected by the host (`@nexus/wake-word`
   * or an equivalent). When absent, wake listening stays `off`. A wake can only
   * open the voice session; it never authenticates or approves anything.
   */
  wakeEngine?: WakeWordEngineLike | null;
  /**
   * Plan Part W — fetch a private wake artifact (enrolment wav) by opaque ref.
   * MUST read only device-visible private storage; bytes are never logged.
   */
  wakeArtifactFetcher?: WakeArtifactFetcherLike | null;
  /**
   * Standing client tools registered at create time — same map `registerTool`
   * writes to. Use this when a host cannot call `registerTool` because it does
   * not build the controller (e.g. `NexusChatApp` with a `client` prop).
   */
  tools?: Array<{
    descriptor: ChatToolDescriptor;
    handler: (args: unknown) => Promise<unknown> | unknown;
  }>;
  /**
   * Client tools declared by shape, so a host can register one without building
   * a full descriptor. A `discoverable` entry stays off `browserFunctionCalls`
   * and only its index entry rides along.
   */
  clientTools?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    access?: import('./types.js').ChatClientToolAccess;
    availability?: 'pinned' | 'discoverable';
    handler: (args: unknown) => Promise<unknown> | unknown;
  }>;
  /**
   * Page tools for the open screen (sitemap search, navigation, per-screen
   * instructions). Swappable later with `setPageTools` on a route change.
   */
  pageTools?: PageToolSource | null;
};

/**
 * Headless Nexus chat controller — framework-free.
 * Portal and OAuth embeds inject a CommandClient with the same send contract.
 */
export function createNexusChat(opts: CreateNexusChatOptions): NexusChat {
  const features: ChatFeatures = { ...DEFAULT_FEATURES, ...(opts.features || {}) };
  const lockedAgent = parseLockedAgent(opts.lockedAgent);
  let hostPageContext: HostPageContext | undefined;
  /** Plan Part C11 — opt-in app route/screen context (structure-only). */
  let appRouteContext: AppRouteContext | undefined;
  const streamResolver = new StreamEndpointResolver();
  const translate = (key: keyof typeof DEFAULT_I18N) => opts.i18n?.[key] || DEFAULT_I18N[key];
  const store = createStore({
    panels: [emptyPanel()],
    activePanelIndex: 0,
    contacts: [],
    rooms: [],
    roomPresence: {},
    calls: [],
    messages: [],
    turns: [],
    streaming: false,
    history: { hasMore: false, oldest: null, loading: false, loadingMore: false },
    lastDispatchSkip: null,
    selectedAgentId: null,
    conversationId: null,
    features,
    agentSource: opts.agentSource || 'nexus',
    transport: opts.transport || 'direct',
    aiDisclosureVisible: true,
  });

  const syncMessagesFromTurns = (turns: ChatTurn[]) => {
    store.setState({
      turns,
      messages: turns.map((t) => ({
        id: t.id,
        role: t.role,
        content: t.text,
        toolEvents: t.toolEvents,
        compaction: t.compaction,
        usage: t.usage,
        deliveryStatus: t.deliveryStatus,
        deliveryError: t.deliveryError,
      })),
      panels: store.getState().panels.map((panel, index) =>
        index === store.getState().activePanelIndex ? { ...panel, turns } : panel,
      ),
    });
  };
  const patchTurnById = (turnId: string, patch: Partial<ChatTurn>) => {
    const turns = store.getState().turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t));
    syncMessagesFromTurns(turns);
  };
  const markUserDeliveryFailed = (
    turnId: string,
    code: string,
    message: string,
    details?: string,
  ) => {
    const turns = store
      .getState()
      .turns.filter((t) => !(t.role === 'assistant' && !String(t.text || '').trim() && !t.toolEvents?.length))
      .map((t) =>
        t.id === turnId
          ? {
              ...t,
              deliveryStatus: 'failed' as const,
              deliveryError: { code, message, details: details || undefined },
            }
          : t,
      );
    syncMessagesFromTurns(turns);
  };
  const sendWithFallback = async (text: string): Promise<SendMessageResult> => {
    const transport = opts.fallbackTransport;
    if (!transport) {
      return { ok: false, code: 'client_preflight', message: 'Fallback transport is not configured.' };
    }
    const id = `m_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const userTurn: ChatTurn = {
      id,
      role: 'user',
      text,
      deliveryStatus: 'sending',
      deliveryError: null,
      createdAt: nowIso,
    };
    const prior = store.getState().turns;
    syncMessagesFromTurns([...prior, userTurn]);
    store.setState({ streaming: true });
    patchCurrentPanel({ streaming: true, billingIssue: null });
    opts.hooks?.onStreamState?.('streaming');
    opts.logger?.debug?.('fallback_transport_send', { turns: prior.length + 1 });
    try {
      const completion = await transport.complete({ messages: fallbackMessagesFromTurns([...prior, userTurn]) });
      const assistant = assistantFromFallbackCompletion(completion);
      if (!assistant.text.trim() && !assistant.cards.length) {
        throw new Error('The assistant returned an empty reply.');
      }
      const assistantTurn: ChatTurn = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: assistant.text,
        ...(assistant.cards.length ? { cards: assistant.cards } : {}),
        createdAt: new Date().toISOString(),
      };
      syncMessagesFromTurns([
        ...store.getState().turns.map((turn) =>
          turn.id === id ? { ...turn, deliveryStatus: 'sent' as const, deliveryError: null } : turn,
        ),
        assistantTurn,
      ]);
      store.setState({ streaming: false });
      patchCurrentPanel({ streaming: false });
      opts.hooks?.onStreamState?.('idle');
      emitSendOutcome(opts.hooks, 'ok');
      return { ok: true, transport: 'fallback' };
    } catch (err) {
      store.setState({ streaming: false });
      patchCurrentPanel({ streaming: false });
      opts.hooks?.onStreamState?.('error');
      const message = err instanceof Error && err.message.trim() ? err.message : 'Fallback chat failed.';
      const code =
        err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'fallback_transport';
      markUserDeliveryFailed(id, code, message);
      opts.logger?.warn?.('fallback_transport_failed', { code });
      opts.hooks?.onError?.(err);
      emitSendOutcome(opts.hooks, 'exception');
      return { ok: false, code, message };
    }
  };
  const patchCurrentPanel = (patch: Partial<PanelState>) => {
    store.setState({
      panels: store.getState().panels.map((panel, index) =>
        index === store.getState().activePanelIndex ? { ...panel, ...patch } : panel,
      ),
    });
  };
  const mergePanelPatch = (panelId: string, patch: Partial<PanelState>) => {
    store.setState({
      panels: store.getState().panels.map((panel) =>
        panel.id === panelId ? { ...panel, ...patch } : panel,
      ),
    });
  };
  const applyUsageToPanel = (panelId: string, usage: ChatUsageSnapshot | null) => {
    if (!usage) return;
    const panel = store.getState().panels.find((entry) => entry.id === panelId);
    if (!panel) return;
    const usedMinor =
      usage.displayCostMinor ??
      usage.creditsCents ??
      usage.costCents ??
      panel.credits?.usedCents ??
      null;
    const billingMode =
      usage.billingMode ?? panel.credits?.billingMode ?? null;
    mergePanelPatch(panelId, {
      usage: usage as ChatTurn['usage'],
      credits: {
        ...(panel.credits || {}),
        usedCents: usedMinor,
        displayCurrency:
          usage.displayCurrency ?? panel.credits?.displayCurrency ?? null,
        billingMode,
      },
    });
    opts.hooks?.onUsage?.(usage);
  };
  const applyThrottleToPanel = (panelId: string, throttle: ChatThrottleState | null) => {
    if (!throttle) return;
    const panel = store.getState().panels.find((entry) => entry.id === panelId);
    if (!panel) return;
    mergePanelPatch(panelId, { throttle });
  };
  /**
   * One registry for pinned + discoverable client tools. The legacy `tools`
   * option / `registerTool` write here too (pinned unless a descriptor says
   * otherwise), so existing hosts are unchanged.
   */
  const toolRegistry = new ClientToolRegistry();
  /** Page tools for the open screen; swappable with `setPageTools`. */
  let pageTools: PageToolSource | null = opts.pageTools ?? null;
  let activeSocket: WebSocket | null = null;
  /**
   * Server-issued hash of the last discoverable index this conversation sent,
   * plus a local fingerprint of the registry that produced it. When the
   * registry is unchanged, later turns send only the hash and skip the index
   * payload entirely. Reset when the conversation changes or the registry moves.
   */
  let clientToolIndexHashState: {
    hash: string;
    fingerprint: string | null;
    conversationId: string | null;
  } | null = null;

  // Standing tools passed at create time, so a host that does not build the
  // controller (NexusChatApp with `client`) can still register in-page tools.
  for (const tool of opts.tools || []) {
    if (tool?.descriptor?.name) toolRegistry.registerDescriptor(tool.descriptor, tool.handler);
  }
  // Shape-declared client tools (`clientTools`); `discoverable` ones only send
  // a compact index entry and are bound on demand.
  for (const tool of opts.clientTools || []) {
    if (tool?.name && typeof tool.handler === 'function') toolRegistry.register(tool);
  }

  /** Pinned client tools, in the `browserFunctionCalls` shape communicate expects. */
  const registeredToolSchemas = () => toolRegistry.pinnedSchemas();

  /** Discoverable client tools as the compact index sent with a message. */
  const clientToolIndexEntries = () => toolRegistry.indexEntries();

  /** Page-tool schemas for the open screen, in the `browserFunctionCalls` shape. */
  const pageToolSchemas = () => {
    const list = pageTools?.schemas?.() || [];
    return list
      .filter((schema) => schema && typeof schema.name === 'string' && schema.name.trim())
      .map((schema) => ({
        name: schema.name,
        description: schema.description || `Page tool ${schema.name}`,
        parameters: {
          type: schema.parameters?.type || 'object',
          properties: schema.parameters?.properties || {},
          ...(schema.parameters?.required ? { required: schema.parameters.required } : {}),
        },
      }));
  };

  /**
   * Resume a `client_tool` pause with the raw handler result. A `bind` pause
   * instead answers with `{ extraFunctionSchemas }` so the model can call the
   * discoverable tool on the next assemble loop.
   */
  const answerClientToolPause = async (
    req: {
      callId: string;
      name: string;
      arguments: Record<string, unknown>;
      conversationId: string | null;
      action: 'request' | 'bind';
    },
    registry: ClientToolRegistry,
  ) => {
    if (req.action === 'bind') {
      const indexed = isIndexedClientTool(req.name, registry.indexEntries());
      const bind = indexed ? registry.bindResult(req.name) : null;
      await controller.resumeClientTool({
        callId: req.callId,
        result: bind ?? { error: `Unknown client tool "${req.name}"` },
        conversationId: req.conversationId ?? undefined,
      });
      return;
    }
    // Resolution order: registered tool, then page tool, then the host hook.
    const usedPageTool = !registry.has(req.name) && !!pageTools?.canExecute?.(req.name);
    const handler = selectClientToolHandler(req.name, registry.map(), pageTools);
    if (!handler) {
      await opts.hooks?.onClientToolRequest?.({
        callId: req.callId,
        name: req.name,
        arguments: req.arguments,
        conversationId: req.conversationId,
      });
      return;
    }
    let result: unknown;
    try {
      result = await handler(req.arguments, { conversationId: req.conversationId });
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }
    await controller.resumeClientTool({
      callId: req.callId,
      result,
      conversationId: req.conversationId ?? undefined,
    });
    // Page tools may need a follow-up after the resumed turn is on the wire
    // (e.g. a navigate-arrival ping). Only runs for a page tool, never a
    // registered tool that happens to share the name.
    if (usedPageTool) {
      try {
        await pageTools?.afterResult?.(result, { conversationId: req.conversationId });
      } catch (err) {
        log('client_tool_after_result_failed', { message: String(err), name: req.name });
      }
    }
  };

  /**
   * The turn paused on a one-click card. `client_tool` (and a Plan-mode `write`
   * client tool's `requiresApproval`) may auto-resume when a handler exists;
   * `approval` / `mode_switch` always surface to the host so a human decides.
   */
  const handlePendingPause = async (req: {
    kind: PendingPauseKind;
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
    conversationId: string | null;
    requiresApproval: boolean;
    action: 'request' | 'bind';
  }) => {
    const card = parsePendingPauseCard(
      req.kind === 'approval'
        ? 'approval_request'
        : req.kind === 'mode_switch'
          ? 'mode_switch_request'
          : 'client_tool_request',
      {
        callId: req.callId,
        name: req.name,
        arguments: req.arguments,
        ...(req.kind === 'client_tool'
          ? {
              access: clientToolAccessOf(toolRegistry.get(req.name)?.descriptor),
              requiresApproval: req.requiresApproval,
              action: req.action,
            }
          : {}),
      },
    );
    store.setState({
      streaming: false,
      pausedCallId: req.callId,
      pendingPauseKind: req.kind,
      pendingPause: card,
    });
    patchCurrentPanel({ streaming: false, pausedCallId: req.callId });
    opts.hooks?.onStreamState?.('paused');
    if (card) opts.hooks?.onPendingPause?.(card);

    if (req.kind === 'client_tool' && !req.requiresApproval) {
      void answerClientToolPause(
        {
          callId: req.callId,
          name: req.name,
          arguments: req.arguments,
          conversationId: req.conversationId,
          action: req.action,
        },
        toolRegistry,
      ).catch((err) => {
        log('client_tool_hook_failed', { message: String(err), callId: req.callId, name: req.name });
        opts.hooks?.onError?.(err);
      });
    }
  };

  const voice = createVoiceApi({
    client: opts.client,
    hooks: opts.hooks,
    logger: opts.logger,
    getState: () => store.getState(),
    setState: (patch) => store.setState(patch as any),
    patchCurrentPanel,
    syncMessagesFromTurns,
    unwrapData,
  });

  /**
   * Plan Part W2 — idle `wake_listening` state ahead of `startBrowserCall`.
   * The host injects an on-device engine; `onWake` can only open the voice
   * session (never authenticate / approve / dispatch commands).
   */
  let wakeAgentId: string | null = null;
  /** Mobile app-lock gate for `requireUnlocked`. Default true (unlocked). */
  let wakeUnlocked = true;
  const wake = createWakeController({
    surface: 'app',
    config: null,
    engine: opts.wakeEngine ?? null,
    fetchArtifact: opts.wakeArtifactFetcher ?? null,
    isUnlocked: () => wakeUnlocked,
    openVoiceSession: async () => {
      const agentId = wakeAgentId;
      if (!agentId) {
        wake.suspend();
        return;
      }
      await voice.startBrowserCall({
        agentId,
        conversationId: store.getState().conversationId,
      });
    },
    logger: opts.logger,
    onStateChange: (snapshot) => opts.hooks?.onWakeStateChange?.(snapshot),
  });

  const agentIndex = new ConversationAgentIndex();
  const contactThreads = createContactThreadApi(
    { send: opts.client.send.bind(opts.client) },
    {
      lockedAgent,
      onConversationAgents: (notes) => agentIndex.rememberAll(notes),
    },
  );

  const guardLockedChannel = (input: {
    roomId?: string | null;
    conversationId?: string | null;
    requireKnownConversation?: boolean;
    adoptedConversationId?: string | null;
  }) =>
    guardLockedAgentChannel({
      locked: lockedAgent,
      roomId: input.roomId,
      conversationId: input.conversationId,
      known: agentIndex.get(input.conversationId),
      requireKnownConversation: input.requireKnownConversation,
      adoptedConversationId: input.adoptedConversationId,
    });

  const logLockedAgentRefusal = (decision: {
    code: string;
    conversationId?: string | null;
    roomId?: string | null;
  }) => {
    if (!lockedAgent) return;
    opts.logger?.warn?.('locked_agent_send_rejected', {
      code: decision.code,
      virtualEmployeeId: lockedAgent.virtualEmployeeId,
      conversationId: decision.conversationId ?? null,
      hasRoom: Boolean(decision.roomId),
    });
  };

  const log = (msg: string, extra?: Record<string, unknown>) => {
    opts.logger?.debug?.(msg, extra);
  };

  const listConversationMessages = async (convId: string): Promise<ListedChatMessage[]> => {
    const listed = await opts.client.send('anx.communicate.conversations.messages.list', {
      conversationId: convId,
      limit: 20,
    });
    const listedData = unwrapData(listed);
    const msgs = listedData.messages;
    return Array.isArray(msgs) ? (msgs as ListedChatMessage[]) : [];
  };

  let liveAttach: LiveAttachSession | null = null;
  let liveAttachCleanup: ((outcome: LiveAttachOutcome) => void) | null = null;
  const settleLiveAttach = (fallback: LiveAttachOutcome) => {
    const session = liveAttach;
    const cleanup = liveAttachCleanup;
    if (!session) return;
    liveAttach = null;
    liveAttachCleanup = null;
    session.settle(fallback);
    void session.promise.then((r) => cleanup?.(r.outcome));
  };

  const closeSocket = () => {
    settleLiveAttach('superseded');
    if (activeSocket) {
      try {
        activeSocket.close();
      } catch {
        /* ignore */
      }
      activeSocket = null;
      // Primary stream ended: background sub-agents keep reporting via the observer.
      setTimeout(() => void subAgentObserver.ensure(), 0);
    }
  };

  const hasLiveStream = (): boolean => {
    if (!activeSocket) return false;
    const state = (activeSocket as WebSocket).readyState;
    return state === WebSocket.OPEN || state === WebSocket.CONNECTING;
  };

  const subAgentSeq = new SubAgentSeqTracker();
  /** Never a real turn id: observer events only patch turns owning a sub-agent row. */
  const OBSERVER_TURN_ID = '__sub_agent_observer__';

  const applyRunStates = (runs: SubAgentRunState[]): boolean => {
    const current = store.getState().turns;
    const next = applySubAgentRunStatesToTurns(current, runs);
    if (next === current) return false;
    syncMessagesFromTurns(next);
    return true;
  };

  /** `activity` (kind `sub_agent`) for the open conversation → widget phase / pending approval. */
  const applySubAgentActivity = (data: unknown): boolean => {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (d.kind !== 'sub_agent' || typeof d.runId !== 'string' || typeof d.status !== 'string') {
      return false;
    }
    const conversationId = store.getState().conversationId;
    if (!conversationId || d.conversationId !== conversationId) return false;
    return applyRunStates([
      {
        runId: d.runId,
        status: d.status,
        linkedConversationId:
          typeof d.linkedConversationId === 'string' ? d.linkedConversationId : null,
        pendingApproval: pendingApprovalFromPayload(d),
      },
    ]);
  };

  /** A failed / superseded attach must not leave the observer suspended. */
  const resumeObserverAfter = <T,>(result: T): T => {
    setTimeout(() => void subAgentObserver.ensure(), 0);
    return result;
  };

  const subAgentObserver = new SubAgentObserver({
    prepare: async (conversationId) => {
      try {
        await streamInit({ conversationId });
      } catch (err) {
        opts.logger?.warn?.('sub_agent_observer_stream_init_failed', {
          conversationId,
          message: String(err),
        });
        return false;
      }
      return streamResolver.getOrderedEndpoints().length > 0;
    },
    connect: (handlers) =>
      streamResolver
        .connectWebSocket(handlers)
        .then((ws) => ws as unknown as { close(): void })
        .catch(() => null),
    canObserve: (conversationId) =>
      store.getState().conversationId === conversationId &&
      !hasLiveStream() &&
      !store.getState().streaming,
    onEvent: (conversationId, parsed) => {
      if (store.getState().conversationId !== conversationId) {
        subAgentObserver.stop();
        return;
      }
      if (parsed.type === 'activity') {
        applySubAgentActivity(parsed.data);
        return;
      }
      if (subAgentSeq.alreadyApplied(conversationId, parsed)) return;
      subAgentSeq.record(conversationId, parsed);
      if (parsed.type === 'permission_elevation_request') {
        opts.hooks?.onPermissionElevationRequired?.(permissionElevationInfoFromEvent(parsed.data));
        return;
      }
      if (parsed.type === 'data_access_approval_request') {
        emitDataAccessApprovalOnce(dataAccessApprovalInfoFrom(parsed.data));
        return;
      }
      const current = store.getState().turns;
      const next = applyStreamEventToTurns(current, OBSERVER_TURN_ID, parsed);
      if (next !== current) syncMessagesFromTurns(next);
    },
    onGenerationStart: (conversationId) => {
      if (opts.hooks?.onObservedGenerationStart) {
        opts.hooks.onObservedGenerationStart({ conversationId });
      } else {
        void controller.attachLiveGeneration({ conversationId });
      }
    },
    logger: {
      debug: (msg, extra) => opts.logger?.debug?.(msg, extra),
      warn: (msg, extra) => opts.logger?.warn?.(msg, extra),
    },
  });

  const finishPausedTurn = () => {
    store.setState({ streaming: false });
    patchCurrentPanel({ streaming: false });
    opts.hooks?.onStreamState?.('idle');
    closeSocket();
  };

  /**
   * One live conversation stream → assistant turn. Shared by `send` and
   * `attachLiveGeneration` (reload / navigate back while the agent is still working).
   * `requireGenerationStart` drops replayed tokens from a previous turn until this
   * turn's generationStart marker; attach sets it false because the replay buffer
   * only ever holds the in-flight turn.
   */
  const createLiveStreamMessageHandler = (ctx: {
    assistantId: string;
    panelId?: string | null;
    requireGenerationStart: boolean;
  }) => {
    const { assistantId, panelId } = ctx;
    let acceptStreamTokens = !ctx.requireGenerationStart;
    let turns: ChatTurn[] = store.getState().turns;
    return (ev: MessageEvent) => {
      const parsed = parseStreamMessage(ev.data);
      if (!parsed) return;
      const streamConversationId = store.getState().conversationId;
      if (subAgentSeq.alreadyApplied(streamConversationId, parsed)) return;
      subAgentSeq.record(streamConversationId, parsed);
      if (parsed.type === 'activity') {
        applySubAgentActivity(parsed.data);
        return;
      }
      // Drop Redis replay from the previous turn until this turn's
      // generationStart marker arrives (ConversationDispatch clears
      // replay after message.send, which is after WS connect).
      // assistant_final is included: a replayed final otherwise fills the
      // empty bubble with the previous reply before the marker arrives.
      if (isGenerationStartStreamEvent(parsed)) {
        acceptStreamTokens = true;
      } else if (shouldDropReplayedStreamEvent(parsed, acceptStreamTokens)) {
        return;
      }
      // Prefer store turns so deliveryStatus patches are not clobbered.
      turns = applyStreamEventToTurns(store.getState().turns, assistantId, parsed);
      syncMessagesFromTurns(turns);
      if (panelId && parsed.type === 'usage') {
        const turnUsage = turns.find((t) => t.id === assistantId)?.usage || null;
        applyUsageToPanel(panelId, turnUsage);
      }
      if (parsed.type === 'chat_command') {
        const command = parsed.data && typeof parsed.data === 'object' ? parsed.data as { name?: string; modelId?: string; hostingType?: string | null } : null;
        if (command) opts.hooks?.onChatCommand?.(command);
      }
      if (parsed.type === 'tool_call') {
        const data = (parsed.data || {}) as { name?: string; arguments?: unknown };
        opts.hooks?.onToolCall?.(String(data.name || 'tool'), data.arguments);
      }
      if (parsed.type === 'tool_result') {
        const run = turns
          .find((t) => t.id === assistantId)
          ?.toolEvents?.find(
            (r) =>
              r.id ===
              String(
                (parsed.data as { callId?: string })?.callId ||
                  (parsed.data as { id?: string })?.id ||
                  '',
              ),
          );
        if (run?.status === 'needs_approval') {
          opts.hooks?.onToolApprovalRequired?.({
            callId: run.id,
            tool: run.tool,
            approvalId: run.approvalId,
            conversationId: store.getState().conversationId || null,
          });
        }
        const toolResult =
          parsed.data && typeof parsed.data === 'object'
            ? (parsed.data as { result?: unknown }).result
            : undefined;
        if (
          toolResult &&
          typeof toolResult === 'object' &&
          (toolResult as { needsApproval?: unknown }).needsApproval === true &&
          (toolResult as { approvalKind?: unknown }).approvalKind ===
            'permission_elevation'
        ) {
          const elev = toolResult as {
            elevationId?: string | null;
            pack?: string | null;
            command?: string | null;
            commandNames?: string[];
            resume?: { command?: string };
            resourceRef?: Record<string, unknown> | null;
            reason?: string | null;
            requiredOnboardingType?: string | null;
            onboardingSatisfied?: boolean;
          };
          const commandNames = elevationCommandNames(elev);
          opts.hooks?.onPermissionElevationRequired?.({
            elevationId: elev.elevationId ?? null,
            pack: elev.pack ?? null,
            command:
              typeof elev.command === 'string' ? elev.command : null,
            commandNames,
            callId: run?.id ?? null,
            resourceRef: elev.resourceRef ?? null,
            reason: elev.reason ?? null,
            requiredOnboardingType: elev.requiredOnboardingType ?? null,
            onboardingSatisfied: elev.onboardingSatisfied,
          });
          finishPausedTurn();
        }
        if (
          toolResult &&
          typeof toolResult === 'object' &&
          (toolResult as { needsApproval?: unknown }).needsApproval === true &&
          ((toolResult as { approvalKind?: unknown }).approvalKind === 'data_access' ||
            (toolResult as { status?: unknown }).status ===
              'data_access_approval_required')
        ) {
          emitDataAccessApprovalOnce(
            dataAccessApprovalInfoFrom(toolResult, run?.id ?? null),
          );
          finishPausedTurn();
        }
      }
      if (parsed.type === 'permission_elevation_request') {
        opts.hooks?.onPermissionElevationRequired?.(permissionElevationInfoFromEvent(parsed.data));
        // A background sub-agent's pause does not pause this parent turn.
        if (!isSubAgentApprovalEvent(parsed.data)) finishPausedTurn();
      }
      if (parsed.type === 'data_access_approval_request') {
        emitDataAccessApprovalOnce(dataAccessApprovalInfoFrom(parsed.data));
        finishPausedTurn();
      }
      if (parsed.type === 'mode_changed') {
        const change = parseModeChangedEvent(parsed.data);
        if (change) opts.hooks?.onModeChanged?.(change);
      }
      let pendingPause = false;
      if (
        parsed.type === 'client_tool_request' ||
        parsed.type === 'approval_request' ||
        parsed.type === 'mode_switch_request'
      ) {
        const data = (parsed.data || {}) as Record<string, unknown>;
        const callId = String(data.callId || '');
        const name = String(data.name || data.command || '');
        if (callId) {
          pendingPause = true;
          void Promise.resolve(
            handlePendingPause({
              kind: normalizePendingPauseKind(
                parsed.type === 'client_tool_request' ? data.kind : parsed.type.replace('_request', ''),
              ),
              callId,
              name,
              arguments:
                data.arguments && typeof data.arguments === 'object'
                  ? (data.arguments as Record<string, unknown>)
                  : {},
              conversationId: store.getState().conversationId || null,
              requiresApproval: data.requiresApproval === true,
              action: data.action === 'bind' ? 'bind' : 'request',
            }),
          ).catch((err) => {
            log('pending_pause_failed', { message: String(err), callId, type: parsed.type });
            opts.hooks?.onError?.(err);
          });
        }
      }
      if (parsed.type === 'paused') {
        // Keep WS open for a pending-pause resume; other pauses finish the turn.
        if (!pendingPause && !store.getState().pausedCallId) {
          finishPausedTurn();
        }
      }
      if (
        parsed.type === 'done' ||
        parsed.type === 'complete' ||
        parsed.type === 'finished' ||
        parsed.type === 'error'
      ) {
        if (parsed.type === 'error' && panelId) {
          const errData =
            parsed.data && typeof parsed.data === 'object'
              ? (parsed.data as Record<string, unknown>)
              : {};
          const issue = classifyChatBillingIssue({
            code: errData.code,
            message: errData.message,
          });
          if (issue) {
            mergePanelPatch(panelId, billingPatchFromIssue(issue));
            if (typeof issue.message === 'string' && issue.message) {
              opts.hooks?.onError?.(new Error(issue.message));
            }
          }
        }
        const finished = store.getState().turns;
        const placeholder = finished.find((t) => t.id === assistantId);
        if (isEmptyAssistantTurn(placeholder)) {
          syncMessagesFromTurns(finished.filter((t) => t.id !== assistantId));
          log('empty_assistant_turn_dropped', { assistantId });
        }
        store.setState({ streaming: false });
        patchCurrentPanel({ streaming: false });
        opts.hooks?.onStreamState?.(parsed.type === 'error' ? 'error' : 'idle');
        closeSocket();
      }
    };
  };

  // The backend emits both a needs_approval tool_result and a data_access_approval_request
  // for one pause; a re-prompt always carries a fresh grantId, so it is never suppressed.
  let lastDataAccessApprovalKey: string | null = null;
  const emitDataAccessApprovalOnce = (info: DataAccessApprovalInfo) => {
    const key = info.callId && info.grantId ? `${info.callId}:${info.grantId}` : null;
    if (key && key === lastDataAccessApprovalKey) return;
    lastDataAccessApprovalKey = key;
    opts.hooks?.onDataAccessApproval?.(info);
  };

  const streamInit = async (initOpts: {
    conversationId?: string;
    contactId?: string;
    roomId?: string;
  }) => {
    const gated = guardLockedChannel({
      roomId: initOpts.roomId,
      conversationId: initOpts.conversationId,
      requireKnownConversation: true,
    });
    if (!gated.ok) {
      logLockedAgentRefusal(gated);
      throw new Error(gated.message);
    }
    const result = (await opts.client.send('anx.communicate.stream-init', {
      conversationId: initOpts.conversationId,
      contactId: initOpts.contactId,
      roomId: initOpts.roomId,
    })) as SendResult & { data?: Record<string, unknown> };
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
      if (result.kind === 'sca_required') {
        opts.hooks?.onScaRequired?.({
          authRequestId: result.authRequestId ?? null,
          command: 'anx.communicate.stream-init',
        });
      }
      throw new Error(result.message || 'stream-init failed');
    }
    const payload = unwrapData(result);
    const resourceId = typeof payload?.resourceId === 'string' ? payload.resourceId : null;
    const adopted = guardLockedChannel({
      roomId: initOpts.roomId,
      conversationId: initOpts.conversationId,
      requireKnownConversation: true,
      adoptedConversationId: resourceId,
    });
    if (!adopted.ok) {
      logLockedAgentRefusal(adopted);
      throw new Error(adopted.message);
    }
    streamResolver.setFromStreamInit(payload || {});
    // Room streams are keyed by room id. Copying that into conversationId makes
    // billing and context-details look up a conversation that does not exist.
    if (initOpts.roomId) {
      const roomKey = String(initOpts.roomId);
      const current = store.getState().conversationId;
      if (current && (current === roomKey || current === String(payload?.resourceId || ''))) {
        store.setState({ conversationId: null });
        patchCurrentPanel({ conversationId: null });
      }
    } else if (payload?.resourceId) {
      store.setState({ conversationId: String(payload.resourceId) });
      patchCurrentPanel({ conversationId: String(payload.resourceId) });
    }
  };

  const openContact = async (contactId: string, openOpts?: { title?: string }) => {
    if (
      lockedAgent &&
      !lockedAgentAllowsContact(lockedAgent, { id: contactId, virtualEmployeeId: contactId })
    ) {
      opts.logger?.warn?.('locked_agent_contact_rejected', {
        virtualEmployeeId: lockedAgent.virtualEmployeeId,
        contactId,
      });
      throw new Error(`Chat is locked to agent ${lockedAgent.virtualEmployeeId}`);
    }
    const contact = findChatContact(store.getState().contacts, contactId);
    const virtualEmployeeId =
      contact?.type === 'agent' ? contact.virtualEmployeeId || contact.id : undefined;
    const agentId = contact?.agentId || undefined;

    // Always creates a new conversation (backend does not resume-per-agent).
    // Pass an existing conversationId via send/stream paths to continue a thread.
    const result = (await opts.client.send('anx.communicate.conversations.create', {
      ...(virtualEmployeeId
        ? { virtualEmployeeId }
        : { agentId: agentId || contactId }),
      ...(openOpts?.title ? { title: openOpts.title } : {}),
    })) as SendResult;

    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
      if (result.kind === 'sca_required') {
        opts.hooks?.onScaRequired?.({
          authRequestId: result.authRequestId ?? null,
          command: 'anx.communicate.conversations.create',
        });
      }
      throw commandFailureError(result, 'conversations.create failed');
    }

    const data = unwrapData(result);
    const conversationId = String(data.conversationId || '');
    const resolvedAgentId = data.agentId ? String(data.agentId) : undefined;
    const requestedTitle = typeof openOpts?.title === 'string' ? openOpts.title.trim() : '';
    if (conversationId && requestedTitle) {
      const renamed = (await opts.client.send('anx.communicate.conversations.update', {
        conversationId,
        title: requestedTitle,
      })) as SendResult;
      if (renamed && typeof renamed === 'object' && 'ok' in renamed && renamed.ok === false) {
        throw commandFailureError(renamed, 'conversations.update failed');
      }
    }
    const canonicalId = contact?.id || contactId;
    if (conversationId) {
      agentIndex.remember(
        conversationAgentNoteFromContact(conversationId, {
          id: canonicalId,
          type: contact?.type || 'agent',
          virtualEmployeeId:
            contact?.virtualEmployeeId ||
            (contact?.type === 'agent' || !contact ? canonicalId : null),
          agentId: resolvedAgentId || contact?.agentId,
        }),
      );
    }
    store.setState({
      conversationId: conversationId || store.getState().conversationId,
      selectedAgentId: canonicalId,
      contacts: store.getState().contacts.map((c) =>
        c.id === canonicalId || (Array.isArray(c.aliases) && c.aliases.includes(contactId))
          ? {
              ...c,
              agentId: resolvedAgentId || c.agentId,
              virtualEmployeeId:
                (data.anxVeId ? String(data.anxVeId) : null) || c.virtualEmployeeId,
            }
          : c,
      ),
    });
    // New conversation always starts empty; keep prior turns and the list
    // selection will stay on the previous thread after create.
    syncMessagesFromTurns([]);
    patchCurrentPanel({
      contactId: canonicalId,
      contactType: contact?.type || 'agent',
      conversationId: conversationId || store.getState().conversationId,
      roomId: null,
      roomPurpose: 'conversation',
      turns: [],
    });
    return { conversationId, agentId: resolvedAgentId };
  };

  const getConversationSummary = async (conversationId: string): Promise<ConversationSummaryResult> => {
    const result = (await opts.client.send(
      'anx.communicate.conversations.summary.get',
      { conversationId },
    )) as SendResult | unknown;
    if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
      const fail = result as Extract<SendResult, { ok: false }>;
      throw new Error(fail.message || 'conversations.summary.get failed');
    }
    const data = unwrapData(result);
    const raw = data.structuredSummary as ConversationSummaryResult['structuredSummary'] | undefined;
    return {
      conversationId: String(data.conversationId || conversationId),
      structuredSummary: raw ?? null,
    };
  };

  let whenLockedAgentReady: Promise<{ conversationId: string; created: boolean } | null> =
    Promise.resolve(null);

  const controller: NexusChat = {
    getState: store.getState,
    subscribe: store.subscribe,
    features,
    lockedAgent,
    get whenLockedAgentReady() {
      return whenLockedAgentReady;
    },
    streamResolver,
    getConversationSummary,
    registerTool(descriptor, handler) {
      toolRegistry.registerDescriptor(descriptor, handler);
    },
    registerClientTool(input) {
      toolRegistry.register(input);
    },
    getClientToolIndex() {
      return clientToolIndexEntries();
    },
    setPageTools(source) {
      pageTools = source ?? null;
    },
    async listAvailableModels(input) {
      if (!features.modelPicker) return { models: [], priceScaleReference: null };
      return listAvailableChatModels(opts.client, input);
    },
    async loadContacts() {
      if (lockedAgent) {
        opts.logger?.debug?.('locked_agent_skip_contacts', {
          virtualEmployeeId: lockedAgent.virtualEmployeeId,
        });
        return;
      }
      if (!features.contacts) return;

      const [humanResult, veResult, vePublicResult] = await Promise.all([
        opts.client.send('anx.communicate.contacts.list', {}),
        opts.client.send('anx.ai-agents.virtual-employees.list', {}),
        opts.client.send('anx.ai-agents.virtual-employees.list-public', {}),
      ]);
      const assetAgentsResult = opts.client.send('anx.communicate.contacts.asset-agents.list', {});

      const handleFail = (result: unknown, command: string) => {
        if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
          const fail = result as Extract<SendResult, { ok: false }>;
          if (fail.kind === 'sca_required') {
            opts.hooks?.onScaRequired?.({
              authRequestId: fail.authRequestId ?? null,
              command,
            });
          }
          return true;
        }
        return false;
      };

      handleFail(humanResult, 'anx.communicate.contacts.list');
      handleFail(veResult, 'anx.ai-agents.virtual-employees.list');
      handleFail(vePublicResult, 'anx.ai-agents.virtual-employees.list-public');

      const humanData = unwrapData(humanResult);
      const veData = unwrapData(veResult);
      const vePublicData = unwrapData(vePublicResult);

      const humanRows = Array.isArray(humanData.contacts)
        ? (humanData.contacts as unknown[])
        : Array.isArray(humanResult)
          ? (humanResult as unknown[])
          : [];

      // Region list handlers often return the array as responseObject directly.
      const veRows: unknown[] = Array.isArray(veData)
        ? veData
        : Array.isArray(veData.employees)
          ? (veData.employees as unknown[])
          : Array.isArray(veData.items)
            ? (veData.items as unknown[])
            : Array.isArray(veResult)
              ? (veResult as unknown[])
              : [];

      const vePublicRows: unknown[] = Array.isArray(vePublicData)
        ? vePublicData
        : Array.isArray(vePublicData.employees)
          ? (vePublicData.employees as unknown[])
          : Array.isArray(vePublicData.items)
            ? (vePublicData.items as unknown[])
            : Array.isArray(vePublicResult)
              ? (vePublicResult as unknown[])
              : [];

      const byId = new Map<string, ChatContact>();
      // Owned VEs first — marks canConfigure so portal can deep-link to agent settings.
      const publicFilesBaseUrl = opts.publicFilesBaseUrl || null;
      for (const c of mapVeAgents(veRows, { canConfigure: true, publicFilesBaseUrl })) {
        byId.set(c.id, c);
      }
      for (const c of mapVeAgents(vePublicRows, { canConfigure: false, publicFilesBaseUrl })) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
      for (const c of mapHumanContacts(humanRows)) {
        byId.set(c.id, c);
      }

      // People and agents are ready. Asset scans stay off this critical path
      // until they resolve, then they are merged in.
      store.setState({ contacts: Array.from(byId.values()) });
      void hydrateAgentAvatars(Array.from(byId.values()), opts.client, publicFilesBaseUrl)
        .then((hydrated) => {
          const current = store.getState().contacts;
          const assets = current.filter((c) => c.type === 'asset_agent');
          const next = hydrated.filter((c) => c.type !== 'asset_agent').concat(assets);
          store.setState({ contacts: next });
        })
        .catch(() => {});

      void assetAgentsResult
        .then((resolvedAssets) => {
          handleFail(resolvedAssets, 'anx.communicate.contacts.asset-agents.list');
          const assetAgentsData = unwrapData(resolvedAssets);
          const assetAgentRows: unknown[] = Array.isArray(assetAgentsData.contacts)
            ? (assetAgentsData.contacts as unknown[])
            : Array.isArray(assetAgentsData)
              ? (assetAgentsData as unknown[])
              : Array.isArray(resolvedAssets)
                ? (resolvedAssets as unknown[])
                : [];
          const merged = new Map<string, ChatContact>();
          for (const contact of store.getState().contacts) {
            if (contact.type !== 'asset_agent') merged.set(contact.id, contact);
          }
          for (const contact of mapAssetAgentContacts(assetAgentRows)) {
            merged.set(contact.id, contact);
          }
          store.setState({ contacts: Array.from(merged.values()) });
        })
        .catch(() => {
          // Keep people and agents when the asset scan fails.
        });
    },
    openContact,
    listConversations: contactThreads.listConversations.bind(contactThreads),
    listMessages: contactThreads.listMessages.bind(contactThreads),
    archiveConversation: contactThreads.archiveConversation.bind(contactThreads),
    reopenConversation: contactThreads.reopenConversation.bind(contactThreads),
    deleteConversation: contactThreads.deleteConversation.bind(contactThreads),
    async openLatest(contact, openOpts) {
      const res = await contactThreads.openLatest(contact, openOpts);
      const resolved = findChatContact(store.getState().contacts, contact.id) || contact;
      const canonicalId = resolved.id || contact.id;
      store.setState({
        selectedAgentId: canonicalId,
        conversationId: res.conversationId || store.getState().conversationId,
      });
      patchCurrentPanel({
        contactId: canonicalId,
        contactType: resolved.type || 'agent',
        conversationId: res.conversationId || store.getState().conversationId,
        roomId: null,
        roomPurpose: 'conversation',
      });
      return res;
    },
    async resetConversation(contact, currentConversationId) {
      const res = await contactThreads.resetConversation(contact, currentConversationId);
      const resolved = findChatContact(store.getState().contacts, contact.id) || contact;
      const canonicalId = resolved.id || contact.id;
      store.setState({
        selectedAgentId: canonicalId,
        conversationId: res.conversationId,
      });
      syncMessagesFromTurns([]);
      patchCurrentPanel({
        contactId: canonicalId,
        contactType: resolved.type || 'agent',
        conversationId: res.conversationId,
        roomId: null,
        roomPurpose: 'conversation',
        turns: [],
        streaming: false,
      });
      return res;
    },
    history: contactThreads.history.bind(contactThreads),
    streamInit,
    hasLiveStream,
    discardLocalUnsentTurns(turnIds: string[]) {
      const current = store.getState().turns;
      const remove = new Set(discardableUnsentTurnIds(current, Array.isArray(turnIds) ? turnIds : []));
      if (!remove.size) return [];
      syncMessagesFromTurns(current.filter((turn) => !remove.has(turn.id)));
      opts.logger?.warn?.('outgoing_unsent_turns_discarded', { count: remove.size });
      return [...remove];
    },
    async listRooms() {
      if (lockedAgent) {
        opts.logger?.debug?.('locked_agent_skip_rooms', {
          virtualEmployeeId: lockedAgent.virtualEmployeeId,
        });
        store.setState({ rooms: [] });
        return [];
      }
      const result = (await opts.client.send('anx.communicate.rooms.list', {})) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.list failed');
      }
      const data = unwrapData(result);
      const rows = Array.isArray(data.rooms)
        ? (data.rooms as Array<Record<string, unknown>>)
        : Array.isArray(data.items)
          ? (data.items as Array<Record<string, unknown>>)
          : Array.isArray(result)
            ? (result as Array<Record<string, unknown>>)
            : [];
      const rooms: ChatRoomSummary[] = rows.map((row, i) => {
        const participantNames = Array.isArray(row.participantNames)
          ? row.participantNames.map((n) => String(n || '').trim()).filter(Boolean)
          : [];
        const participantCount =
          typeof row.participantCount === 'number' ? row.participantCount : undefined;
        const customName = String(row.name || row.title || row.label || '').trim() || null;
        const type = typeof row.type === 'string' && row.type ? String(row.type) : 'group';
        const fallbackTitle =
          participantCount != null && participantCount > 2
            ? 'Room'
            : participantNames[0] || 'Room';
        return {
          id: String(row.roomId || row.id || row._id || `room_${i}`),
          title: customName || fallbackTitle,
          name: customName,
          type,
          participantCount,
          participantNames,
          unreadCount: typeof row.unreadCount === 'number' ? row.unreadCount : undefined,
          lastActivityAt:
            typeof row.lastMessageAt === 'string' && row.lastMessageAt
              ? row.lastMessageAt
              : typeof row.createdAt === 'string' && row.createdAt
                ? row.createdAt
                : null,
          assetIds: Array.isArray(row.assetIds)
            ? row.assetIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [],
          assetAgents: Array.isArray(row.assetAgents)
            ? (row.assetAgents as Array<Record<string, unknown>>)
                .map((a) => ({
                  assetId: String(a?.assetId || '').trim(),
                  assetAgentKey:
                    typeof a?.assetAgentKey === 'string' && a.assetAgentKey.trim()
                      ? a.assetAgentKey.trim()
                      : null,
                }))
                .filter((a) => a.assetId)
            : [],
          purpose: 'room',
          sceneLink:
            row.sceneLink && typeof row.sceneLink === 'object'
              ? (row.sceneLink as ChatRoomSummary['sceneLink'])
              : null,
        };
      });
      store.setState({ rooms });
      return rooms;
    },
    async createRoom(input) {
      if (lockedAgent) {
        opts.logger?.warn?.('locked_agent_room_rejected', {
          virtualEmployeeId: lockedAgent.virtualEmployeeId,
        });
        throw new Error(`Chat is locked to agent ${lockedAgent.virtualEmployeeId}`);
      }
      const encryptionMode = input.encryptionMode ?? 'server_group_v1';
      const type = input.type ?? 'group';
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const result = (await opts.client.send('anx.communicate.rooms.create', {
        name: title,
        type,
        encryptionMode,
        ...(Array.isArray(input.participants) && input.participants.length
          ? { participants: input.participants }
          : {}),
        ...(input.messageTtlSeconds !== undefined
          ? { messageTtlSeconds: input.messageTtlSeconds }
          : {}),
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.create failed');
      }
      const data = unwrapData(result);
      const roomId = String(data.roomId || data.id || '');
      if (roomId && Array.isArray(input.aiParticipants)) {
        for (const p of input.aiParticipants) {
          if (
            !p?.id ||
            (p.type !== 'agent' && p.type !== 'virtual_agent' && p.type !== 'asset_agent')
          ) {
            continue;
          }
          try {
            await opts.client.send('anx.communicate.rooms.participants.add', {
              roomId,
              participant: {
                type: p.type,
                id: p.id,
                displayName: p.displayName,
                ...(p.type === 'asset_agent' && (p as { assetAgentKey?: string }).assetAgentKey
                  ? { assetAgentKey: (p as { assetAgentKey?: string }).assetAgentKey }
                  : {}),
              },
            });
          } catch {
            // Best-effort: room still opens; host can show add failure separately.
          }
        }
      }
      if (roomId) {
        store.setState({
          rooms: [
            ...store.getState().rooms.filter((room) => room.id !== roomId),
            { id: roomId, title: title || input.title || 'Room', name: title || null, type, purpose: 'room' },
          ],
        });
      }
      return { roomId };
    },
    async updateRoom(input) {
      const result = (await opts.client.send('anx.communicate.rooms.update', {
        roomId: input.roomId,
        name: input.name ?? '',
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.update failed');
      }
      const data = unwrapData(result);
      const name =
        data.name == null || data.name === ''
          ? null
          : String(data.name);
      store.setState({
        rooms: store.getState().rooms.map((room) =>
          room.id === input.roomId
            ? {
                ...room,
                name,
                title: name || room.title,
              }
            : room,
        ),
      });
      return {
        roomId: String(data.roomId || input.roomId),
        name,
        type: typeof data.type === 'string' ? data.type : undefined,
      };
    },
    async addRoomParticipant(input) {
      const result = (await opts.client.send('anx.communicate.rooms.participants.add', {
        roomId: input.roomId,
        participant: input.participant,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.participants.add failed');
      }
      return unwrapData(result);
    },
    async getRoomBillingSummary(roomId) {
      const result = (await opts.client.send('anx.communicate.rooms.billing.summary', {
        roomId,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.billing.summary failed');
      }
      return unwrapData(result);
    },
    async getRoom(roomId) {
      const result = (await opts.client.send('anx.communicate.rooms.get', {
        roomId,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.get failed');
      }
      const data = unwrapData(result);
      const participantsRaw = Array.isArray(data.participants)
        ? (data.participants as Array<Record<string, unknown>>)
        : [];
      const orchestrationRaw =
        data.orchestration && typeof data.orchestration === 'object'
          ? (data.orchestration as Record<string, unknown>)
          : null;
      const orchestration: ChatRoomDetail['orchestration'] = orchestrationRaw
        ? (orchestrationRaw as ChatRoomDetail['orchestration'])
        : {
            defaultAiResponseMode:
              typeof data.defaultAiResponseMode === 'string'
                ? data.defaultAiResponseMode
                : undefined,
            maxAgentTurnsLimit:
              typeof data.maxAgentTurnsLimit === 'number' ? data.maxAgentTurnsLimit : undefined,
            maxAiOnlyChainLength:
              typeof data.maxAiOnlyChainLength === 'number'
                ? data.maxAiOnlyChainLength
                : undefined,
            maxAutoBurstCreditsCents:
              typeof data.maxAutoBurstCreditsCents === 'number'
                ? data.maxAutoBurstCreditsCents
                : data.maxAutoBurstCreditsCents === null
                  ? null
                  : undefined,
            autoChatStyle:
              typeof data.autoChatStyle === 'string' ? data.autoChatStyle : undefined,
            roomRules: Array.isArray(data.roomRules)
              ? (data.roomRules as string[])
              : undefined,
            mentionInfoBubbleDismissed:
              typeof data.mentionInfoBubbleDismissed === 'boolean'
                ? data.mentionInfoBubbleDismissed
                : undefined,
          };
      const aiCfgRows = Array.isArray(orchestration?.aiParticipants)
        ? orchestration!.aiParticipants!
        : Array.isArray(orchestrationRaw?.aiParticipants)
          ? (orchestrationRaw!.aiParticipants as NonNullable<
              NonNullable<ChatRoomDetail['orchestration']>['aiParticipants']
            >)
          : [];
      const aiCfgByKey = new Map<string, ChatRoomParticipant['aiConfig']>();
      for (const row of aiCfgRows) {
        if (!row || typeof row !== 'object') continue;
        const type = String(row.participantType || row.type || '');
        const id = String(row.participantId || row.id || '');
        if (!type || !id) continue;
        aiCfgByKey.set(`${type}:${id}`, {
          modelId: row.modelId ?? null,
          responseMode: row.responseMode ?? null,
          compactBeforeReply: Boolean(row.compactBeforeReply),
        });
      }
      const viewerIsOwner = Boolean(data.viewerIsOwner);
      const viewerIsModerator = Boolean(data.viewerIsModerator);
      const detail: ChatRoomDetail = {
        id: String(data.roomId || data.id || data._id || roomId),
        title: String(data.title || data.name || data.label || 'Room'),
        type: typeof data.type === 'string' ? data.type : undefined,
        ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : null,
        viewerUserId: typeof data.viewerUserId === 'string' ? data.viewerUserId : null,
        viewerIsOwner,
        viewerIsModerator,
        viewerCanManage: Boolean(data.viewerCanManage) || viewerIsOwner || viewerIsModerator,
        encryptionMode: typeof data.encryptionMode === 'string' ? data.encryptionMode : null,
        messageTtlSeconds:
          data.messageTtlSeconds === null
            ? null
            : typeof data.messageTtlSeconds === 'number'
              ? data.messageTtlSeconds
              : undefined,
        orchestration,
        participants: participantsRaw.map((row) => {
          const type = String(row.type || 'user');
          const id = String(row.id || '');
          return {
            type,
            id,
            role: typeof row.role === 'string' ? row.role : null,
            displayName: typeof row.displayName === 'string' ? row.displayName : null,
            username: typeof row.username === 'string' ? row.username : null,
            avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
            aiConfig: aiCfgByKey.get(`${type}:${id}`) || null,
          };
        }),
      };
      return detail;
    },
    async leaveRoom(input) {
      const payload: Record<string, unknown> = {
        roomId: input.roomId,
        action: input.action,
      };
      if (input.newOwnerUserId) payload.newOwnerUserId = input.newOwnerUserId;
      const result = (await opts.client.send(
        'anx.communicate.rooms.leave',
        payload,
      )) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.leave failed');
      }
      const data = unwrapData(result);
      store.setState({
        rooms: store.getState().rooms.filter((room) => room.id !== input.roomId),
      });
      const presence = { ...store.getState().roomPresence };
      delete presence[input.roomId];
      store.setState({ roomPresence: presence });
      return {
        ok: data.ok !== false,
        left: typeof data.left === 'boolean' ? data.left : undefined,
        archived: typeof data.archived === 'boolean' ? data.archived : undefined,
        transferredTo: typeof data.transferredTo === 'string' ? data.transferredTo : undefined,
        roomId: typeof data.roomId === 'string' ? data.roomId : input.roomId,
      };
    },
    async sendRoomMessage(roomId, text) {
      const gated = guardLockedChannel({
        roomId,
        requireKnownConversation: true,
      });
      if (!gated.ok) {
        logLockedAgentRefusal(gated);
        return { ok: false, code: gated.code, message: gated.message };
      }
      const result = await opts.client.send('anx.communicate.rooms.message.send', {
        roomId,
        text,
      });
      return result;
    },
    async removeRoomParticipant(input) {
      const result = (await opts.client.send('anx.communicate.rooms.participants.remove', {
        roomId: input.roomId,
        participantId: input.participantId,
        participantType: input.participantType,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.participants.remove failed');
      }
      return unwrapData(result);
    },
    async updateRoomOrchestration(input) {
      const nested =
        input.orchestration && typeof input.orchestration === 'object'
          ? input.orchestration
          : {};
      const {
        roomId,
        orchestration: _ignored,
        ...flat
      } = input as {
        roomId: string;
        orchestration?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const payload: Record<string, unknown> = {
        roomId,
        ...nested,
        ...flat,
      };
      delete payload.orchestration;
      const result = (await opts.client.send(
        'anx.communicate.rooms.orchestration.update',
        payload,
      )) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.orchestration.update failed');
      }
      return unwrapData(result);
    },
    async createRoomInvite(input) {
      const result = (await opts.client.send('anx.communicate.rooms.invite.create', {
        roomId: input.roomId,
        expiresInMs: input.expiresInMs,
        maxUses: input.maxUses,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.invite.create failed');
      }
      const data = unwrapData(result);
      return {
        inviteCode: String(data.inviteToken || data.inviteCode || data.code || ''),
        expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
      };
    },
    async setRoomRetention(input) {
      const result = (await opts.client.send('anx.communicate.rooms.retention.set', {
        roomId: input.roomId,
        messageTtlSeconds: input.messageTtlSeconds,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.retention.set failed');
      }
      const data = unwrapData(result);
      return {
        roomId: String(data.roomId || input.roomId),
        messageTtlSeconds:
          data.messageTtlSeconds === null
            ? null
            : typeof data.messageTtlSeconds === 'number'
              ? data.messageTtlSeconds
              : input.messageTtlSeconds,
      };
    },
    async redeemRoomInvite(input) {
      const result = (await opts.client.send('anx.communicate.rooms.invite.redeem', {
        inviteCode: input.inviteCode,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.invite.redeem failed');
      }
      const data = unwrapData(result);
      return {
        roomId: String(data.roomId || ''),
        joined: Boolean(data.joined),
      };
    },
    async upgradeRoomEncryption(input) {
      const result = (await opts.client.send('anx.communicate.rooms.encryption.upgrade', {
        roomId: input.roomId,
        targetMode: input.targetMode,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.encryption.upgrade failed');
      }
      const data = unwrapData(result);
      return {
        roomId: String(data.roomId || input.roomId),
        encryptionMode: String(data.encryptionMode || input.targetMode),
      };
    },
    async downgradeRoomEncryption(input) {
      const result = (await opts.client.send('anx.communicate.rooms.encryption.downgrade', {
        roomId: input.roomId,
        targetMode: input.targetMode,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.encryption.downgrade failed');
      }
      const data = unwrapData(result);
      return {
        roomId: String(data.roomId || input.roomId),
        encryptionMode: String(data.encryptionMode || input.targetMode),
      };
    },
    async upsertAiParticipant(input) {
      const nested = input.participant && typeof input.participant === 'object' ? input.participant : null;
      const nestedCfg =
        nested?.config && typeof nested.config === 'object' ? nested.config : {};
      const participantType =
        input.participantType ||
        (nested?.type === 'virtual_agent' ? 'virtual_agent' : nested?.type === 'agent' ? 'agent' : null);
      const participantId = input.participantId || (nested?.id ? String(nested.id) : null);
      if (!participantType || !participantId) {
        throw new Error('participantType and participantId are required');
      }
      const payload: Record<string, unknown> = {
        roomId: input.roomId,
        participantType,
        participantId,
      };
      if (input.modelId !== undefined) payload.modelId = input.modelId;
      else if ('modelId' in nestedCfg) payload.modelId = nestedCfg.modelId;
      if (input.responseMode !== undefined) payload.responseMode = input.responseMode;
      else if ('responseMode' in nestedCfg) payload.responseMode = nestedCfg.responseMode;
      if (input.compactBeforeReply !== undefined) payload.compactBeforeReply = input.compactBeforeReply;
      else if ('compactBeforeReply' in nestedCfg) {
        payload.compactBeforeReply = nestedCfg.compactBeforeReply;
      }
      const result = (await opts.client.send(
        'anx.communicate.rooms.ai-participant.upsert',
        payload,
      )) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        throw new Error(fail.message || 'rooms.ai-participant.upsert failed');
      }
      return unwrapData(result);
    },
    updateRoomPresence(presence) {
      const next = { ...store.getState().roomPresence };
      const roomEntries = [...(next[presence.roomId] || [])];
      const idx = roomEntries.findIndex((entry) => entry.participantId === presence.participantId);
      if (idx >= 0) roomEntries[idx] = presence;
      else roomEntries.push(presence);
      next[presence.roomId] = roomEntries;
      store.setState({ roomPresence: next });
    },
    pollWorkload(workloadId, pollOpts) {
      return pollWorkload(opts.client, workloadId, pollOpts);
    },
    createBrowserCall: voice.createBrowserCall,
    startBrowserCall: async (input) => {
      // Wake listening is an idle state; pause it while a call is live.
      wake.suspendForSession();
      try {
        return await voice.startBrowserCall(input);
      } finally {
        void wake.resumeAfterSession();
      }
    },
    createOutboundCall: voice.createOutboundCall,
    prepareInboundCall: voice.prepareInboundCall,
    getVoiceChannel: voice.getVoiceChannel,
    getActiveVoiceCall: voice.getActiveVoiceCall,
    createRealtimeCall: voice.createRealtimeCall,
    createLiveSttSession: voice.createLiveSttSession,
    connectLiveSttWebSocket: voice.connectLiveSttWebSocket,
    appendVoiceEvent: voice.appendVoiceEvent,
    injectCallText: voice.injectCallText,
    endVoiceCall: voice.endVoiceCall,
    endCall: voice.endCall,
    getVoiceSurface: voice.getVoiceSurface,
    configureWake(config, engine) {
      wake.configure(config, engine);
    },
    getWakeState: () => wake.getState(),
    subscribeWakeState: (listener) => wake.subscribe(listener),
    setWakeAgentId(agentId) {
      wakeAgentId = agentId;
      if (agentId) void wake.refresh();
      else wake.suspend();
    },
    optInWake: () => wake.optIn(),
    optOutWake: () => wake.optOut(),
    setWakeSurfaceOpen(open) {
      if (open) void wake.refresh();
      else wake.suspend();
    },
    /**
     * Plan Part W3 — mobile `requireUnlocked` gate. When dropped to false the
     * controller disarms immediately; re-raising re-arms only if opted in.
     */
    setWakeUnlocked(next: boolean) {
      wakeUnlocked = next;
      if (next) void wake.refresh();
      else wake.suspend();
    },
    refreshWake: () => wake.refresh(),
    subscribeRemotePlaybackStream: voice.subscribeRemotePlaybackStream,
    getRemotePlaybackStream: voice.getRemotePlaybackStream,
    createSpeakTurn: voice.createSpeakTurn,
    reattachVoice: voice.reattachVoice,
    toggleMute: voice.toggleMute,
    pauseCall: voice.pauseCall,
    resumeCall: voice.resumeCall,
    pauseOrResumeCall: voice.pauseOrResumeCall,
    signalBillingCredits: voice.signalBillingCredits,
    rehydrateTurns(
      rows: Array<{
        id?: string;
        role?: string;
        content?: string;
        text?: string;
        toolCalls?: unknown;
        attachments?: IoDescriptor[];
        createdAt?: string | null;
        timestamp?: string | null;
        senderId?: string | null;
        senderName?: string | null;
      }>,
      rehydrateOpts?: {
        conversationId?: string | null;
        roomId?: string | null;
        detachStream?: boolean;
        history?: {
          hasMore?: boolean;
          oldest?: { messageId: string; createdAt: string | null } | null;
        };
      },
    ) {
      const roomId =
        typeof rehydrateOpts?.roomId === 'string' && rehydrateOpts.roomId.trim()
          ? rehydrateOpts.roomId.trim()
          : null;
      const setsConversation =
        !!rehydrateOpts &&
        Object.prototype.hasOwnProperty.call(rehydrateOpts, 'conversationId');
      const nextConversationId = setsConversation
        ? typeof rehydrateOpts?.conversationId === 'string' &&
          rehydrateOpts.conversationId.trim()
          ? rehydrateOpts.conversationId.trim()
          : null
        : null;
      if (lockedAgent && (roomId || setsConversation)) {
        const gated = guardLockedChannel({
          roomId,
          conversationId: setsConversation ? nextConversationId : undefined,
          requireKnownConversation: setsConversation,
        });
        if (!gated.ok) {
          logLockedAgentRefusal(gated);
          return;
        }
      }
      // Rebuilt rows carry no raw sub-agent stream: let the next replay refill it.
      subAgentSeq.reset(store.getState().conversationId);
      // Switching the panel to another room: the in-flight send socket belongs
      // to the previous target and must not keep this panel "streaming".
      if (rehydrateOpts?.detachStream && !liveAttach) {
        closeSocket();
        if (store.getState().streaming) {
          store.setState({ streaming: false });
          patchCurrentPanel({ streaming: false });
          opts.hooks?.onStreamState?.('idle');
        }
      }
      if (
        rehydrateOpts &&
        Object.prototype.hasOwnProperty.call(rehydrateOpts, 'conversationId') &&
        subAgentObserver.targetConversationId &&
        subAgentObserver.targetConversationId !== (rehydrateOpts.conversationId || null)
      ) {
        subAgentObserver.stop();
      }
      // History replaces every turn, including a live-attach bubble; the host
      // re-attaches after rehydrate when the generation is still running.
      if (liveAttach) {
        closeSocket();
        store.setState({ streaming: false });
        patchCurrentPanel({ streaming: false });
        opts.hooks?.onStreamState?.('idle');
      }
      const turns: ChatTurn[] = rows.map((row, i) => {
        const createdAt =
          (typeof row.createdAt === 'string' && row.createdAt) ||
          (typeof row.timestamp === 'string' && row.timestamp) ||
          null;
        const senderId =
          typeof row.senderId === 'string' && row.senderId.trim() ? row.senderId.trim() : null;
        const senderName =
          typeof row.senderName === 'string' && row.senderName.trim()
            ? row.senderName.trim()
            : null;
        return {
          id: String(row.id || `hist_${i}`),
          role: (row.role === 'user' || row.role === 'system' ? row.role : 'assistant') as ChatTurn['role'],
          text: String(row.content ?? row.text ?? ''),
          toolEvents: rehydrateToolRunsFromHistory(
            Array.isArray(row.toolCalls)
              ? (row.toolCalls as Array<Record<string, unknown>>)
              : null,
          ),
          ...(Array.isArray(row.attachments) && row.attachments.length
            ? {
                attachments: mergeAttachmentDisplay(store.getState().turns, row.attachments),
              }
            : {}),
          ...(createdAt ? { createdAt } : {}),
          ...(senderId ? { senderId } : {}),
          ...(senderName ? { senderName } : {}),
        };
      });
      syncMessagesFromTurns(collapseRepeatedToolRows(turns));
      if (roomId) {
        store.setState({ conversationId: null });
        patchCurrentPanel({ conversationId: null, roomId, roomPurpose: 'room' });
      } else if (setsConversation) {
        store.setState({ conversationId: nextConversationId });
        patchCurrentPanel({
          conversationId: nextConversationId,
          roomId: null,
          roomPurpose: 'conversation',
        });
      }
      if (rehydrateOpts?.history) {
        store.setState({
          history: {
            hasMore: !!rehydrateOpts.history.hasMore,
            oldest: rehydrateOpts.history.oldest ?? null,
            loading: false,
            loadingMore: false,
          },
        });
      }
    },
    prependTurns(
      rows: Array<{
        id?: string;
        role: string;
        content?: string;
        text?: string;
        toolCalls?: Array<Record<string, unknown>>;
        attachments?: IoDescriptor[];
        createdAt?: string | null;
        senderId?: string | null;
        senderName?: string | null;
      }>,
      prependOpts?: {
        hasMore?: boolean;
        oldest?: { messageId: string; createdAt: string | null } | null;
      },
    ) {
      const incoming = rows.map((row, i) => ({
        id: String(row.id || `older_${i}`),
        role: (row.role === 'user' || row.role === 'system' ? row.role : 'assistant') as ChatTurn['role'],
        text: String(row.content ?? row.text ?? ''),
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
        ...(row.senderId ? { senderId: row.senderId } : {}),
        ...(row.senderName ? { senderName: row.senderName } : {}),
      }));
      syncMessagesFromTurns(mergePrependedTurns(store.getState().turns, incoming));
      const prev = store.getState().history;
      store.setState({
        history: {
          hasMore: prependOpts?.hasMore ?? prev?.hasMore ?? false,
          oldest: prependOpts?.oldest ?? prev?.oldest ?? null,
          loading: false,
          loadingMore: false,
        },
      });
    },
    applyUsage(usage) {
      const panel = currentPanel(store.getState());
      if (!panel?.id) return;
      if (!usage) {
        mergePanelPatch(panel.id, {
          usage: null,
          credits: {
            ...(panel.credits || {}),
            usedCents: null,
          },
        });
        return;
      }
      applyUsageToPanel(panel.id, usage);
    },
    uploadAttachment(file, uploadOpts) {
      return uploadAttachmentViaRegion(opts.client, file, uploadOpts);
    },
    async approveTool({ approvalId, callId }) {
      const result = (await opts.client.send('anx.ai-agents.approvals.approve', {
        approvalId,
      })) as SendResult;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        if (result.kind === 'sca_required') {
          opts.hooks?.onScaRequired?.({
            authRequestId: result.authRequestId ?? null,
            command: 'anx.ai-agents.approvals.approve',
          });
        }
        return false;
      }
      if (callId) {
        const turns = store.getState().turns.map((t) => ({
          ...t,
          toolEvents: patchToolRunStatus(t.toolEvents || [], callId, {
            status: 'approved',
            approvalRequired: false,
          }),
        }));
        syncMessagesFromTurns(turns);
      }
      return true;
    },
    async revertTool({ approvalId, callId }) {
      const result = (await opts.client.send('anx.ai-agents.approvals.reject', {
        approvalId,
      })) as SendResult;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        if (result.kind === 'sca_required') {
          opts.hooks?.onScaRequired?.({
            authRequestId: result.authRequestId ?? null,
            command: 'anx.ai-agents.approvals.reject',
          });
        }
        return false;
      }
      if (callId) {
        const turns = store.getState().turns.map((t) => ({
          ...t,
          toolEvents: patchToolRunStatus(t.toolEvents || [], callId, {
            status: 'reverted',
            approvalRequired: false,
          }),
        }));
        syncMessagesFromTurns(turns);
      }
      return true;
    },
    async triggerCheckBack(conversationId) {
      const result = (await opts.client.send('anx.communicate.check-back.trigger', {
        conversationId,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        if (fail.kind === 'sca_required') {
          opts.hooks?.onScaRequired?.({
            authRequestId: fail.authRequestId ?? null,
            command: 'anx.communicate.check-back.trigger',
          });
        }
        throw new Error(fail.message || 'check-back.trigger failed');
      }
      const data = unwrapData(result);
      return {
        triggered: true as const,
        status: String(data.status || 'scheduled'),
      };
    },
    async markPrecedentNotApplicable(markOpts) {
      const conversationId =
        markOpts.conversationId || store.getState().conversationId || undefined;
      const result = (await opts.client.send('anx.inference.decisions.false-positive.mark', {
        decisionId: markOpts.decisionId,
        reason: markOpts.reason,
        ...(markOpts.usageRefId ? { usageRefId: markOpts.usageRefId } : {}),
        ...(conversationId ? { conversationId } : {}),
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        const fail = result as Extract<SendResult, { ok: false }>;
        if (fail.kind === 'sca_required') {
          opts.hooks?.onScaRequired?.({
            authRequestId: fail.authRequestId ?? null,
            command: 'anx.inference.decisions.false-positive.mark',
          });
        }
        return { ok: false, message: fail.message || 'Could not mark the precedent as not applicable' };
      }
      return { ok: true };
    },
    setHostPageContext(next) {
      hostPageContext = normalizeHostPageContext(next);
    },
    setAppRouteContext(next) {
      appRouteContext = normalizeAppRouteContext(next);
    },
    async sendMessage(
      text: string,
      sendOpts: {
        conversationId?: string;
        contactId?: string;
        roomId?: string;
        attachments?: IoDescriptor[];
        modelOverride?: ChatModelOverride;
        reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
        uiLocale?: string;
        /** Current portal route — used with tinyPagePointer for page_context. */
        currentPagePath?: string;
        /** Overrides the host page context set with setHostPageContext for this send. */
        pageContext?: HostPageContext;
        /**
         * Tiny page pointer prompt string(s). Prefer over pageInstructions/pageData.
         * Inference tags these as page_context.
         */
        injectedSystemPrompts?: string[];
        /** Structured page entity for anx.* idParam fill (cluster, blueprint, …). */
        pageEntityRef?: {
          type: string;
          id?: string | null;
          name?: string | null;
          saved?: boolean;
        };
        /** @deprecated Prefer understand tool; kept for OAuth copilots. */
        pageInstructions?: string;
        /** @deprecated Prefer understand tool; never dump large form state. */
        pageData?: Record<string, unknown>;
        browserContext?: Record<string, unknown>;
        /** Client-executed tools (anx.page.* + mapped page commands). */
        browserFunctionCalls?: Array<{
          name: string;
          description: string;
          parameters: {
            type: string;
            properties?: Record<string, unknown>;
            required?: string[];
          };
        }>;
        pageFunctionCalls?: string[];
        /**
         * Compact index of discoverable client tools for this turn. Defaults to the
         * registry's discoverable tools; pass `[]` to send none.
         */
        clientToolIndex?: ClientToolIndexEntry[];
        /**
         * Hash of an index already sent this conversation (server-issued). Filled
         * automatically when the registry is unchanged; pass to override.
         */
        clientToolIndexHash?: string;
        /**
         * Structured answer to the open `ask_user_choice` question. When present the
         * server validates it against the stored question and replaces `text`.
         */
        questionAnswer?: QuestionAnswer;
        bypassFallback?: boolean;
        /** Empty thread: ask the agent to greet. Do not show a user turn. */
        conversationOpen?: boolean;
      } = {},
    ): Promise<SendMessageResult> {
      if (
        !sendOpts.conversationOpen &&
        !sendOpts.bypassFallback &&
        fallbackTransportSelected(opts.fallbackTransport)
      ) {
        return sendWithFallback(text);
      }
      let createdForLockedAgent: string | null = null;
      let conversationId = sendOpts.conversationId || store.getState().conversationId || undefined;
      const contactId = sendOpts.contactId || store.getState().selectedAgentId || undefined;
      const roomId = sendOpts.roomId;
      if (lockedAgent) {
        try {
          let gated = guardLockedChannel({ roomId, conversationId });
          if (gated.ok && !gated.conversationId) {
            gated = await resolveLockedAgentSendTarget({
              locked: lockedAgent,
              conversationId,
              contactId,
              roomId,
              contact: contactId ? findChatContact(store.getState().contacts, contactId) : null,
              lookup: (id) => agentIndex.get(id),
              openContact: async (id) => {
                const opened = await openContact(id);
                const createdId =
                  typeof opened?.conversationId === 'string' ? opened.conversationId.trim() : '';
                if (createdId) createdForLockedAgent = createdId;
                return opened;
              },
            });
          }
          if (!gated.ok) {
            logLockedAgentRefusal(gated);
            emitSendOutcome(opts.hooks, 'client_preflight');
            opts.hooks?.onError?.(new Error(gated.message));
            return { ok: false, code: gated.code, message: gated.message };
          }
          conversationId = gated.conversationId || conversationId;
        } catch (openErr) {
          emitSendOutcome(opts.hooks, 'client_preflight');
          const message =
            openErr instanceof Error ? openErr.message : 'Could not open agent conversation';
          const sessionCode = warnNexusSession(
            opts.logger,
            openErr,
            'anx.communicate.conversations.create',
          );
          opts.hooks?.onError?.(openErr);
          return { ok: false, code: sessionCode || 'client_preflight', message };
        }
      }

      const id = `m_${Date.now()}`;
      const prevTurns = store.getState().turns;
      const nowIso = new Date().toISOString();
      const displayAttachments = sendOpts.attachments;
      const commandAttachments = attachmentsForCommand(displayAttachments);
      const userTurn: ChatTurn = {
        id,
        role: 'user',
        text,
        attachments: displayAttachments,
        deliveryStatus: 'sending',
        deliveryError: null,
        createdAt: nowIso,
      };
      if (!sendOpts.conversationOpen) {
        syncMessagesFromTurns([...prevTurns, userTurn]);
      }
      store.setState({ streaming: true });
      patchCurrentPanel({ streaming: true, billingIssue: null });
      opts.hooks?.onStreamState?.('streaming');

      const panel = currentPanel(store.getState());
      const panelId = panel?.id;
      const selectedContact = contactId
        ? findChatContact(store.getState().contacts, contactId)
        : null;
      patchCurrentPanel({
        contactId: selectedContact?.id || contactId || roomId || panel?.contactId || '',
        contactType: roomId ? 'group' : selectedContact?.type || panel?.contactType || 'agent',
        roomId: roomId || null,
        roomPurpose: roomId ? 'room' : 'conversation',
      });

      try {
        if (!roomId && !conversationId && contactId && selectedContact?.type === 'agent') {
          try {
            const opened = await openContact(contactId);
            conversationId = opened.conversationId || conversationId;
            if (lockedAgent && opened.conversationId) {
              const createdId = String(opened.conversationId).trim();
              if (createdId) createdForLockedAgent = createdId;
            }
          } catch (openErr) {
            emitSendOutcome(opts.hooks, 'client_preflight');
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('error');
            const message =
              openErr instanceof Error ? openErr.message : 'Could not open agent conversation';
            const sessionCode = warnNexusSession(
              opts.logger,
              openErr,
              'anx.communicate.conversations.create',
            );
            markUserDeliveryFailed(id, sessionCode || 'client_preflight', message);
            opts.hooks?.onError?.(openErr);
            return { ok: false, code: sessionCode || 'client_preflight', message };
          }
        }

        if (!roomId && !conversationId && !contactId) {
          emitSendOutcome(opts.hooks, 'client_preflight');
          store.setState({ streaming: false });
          patchCurrentPanel({ streaming: false });
          opts.hooks?.onStreamState?.('error');
          const message = 'No conversation or room to send to';
          markUserDeliveryFailed(id, 'client_preflight', message);
          opts.hooks?.onError?.(new Error(message));
          return { ok: false, code: 'client_preflight', message };
        }

        try {
          await streamInit({ conversationId, contactId: conversationId ? undefined : contactId, roomId });
        } catch (initErr) {
          log('stream_init_failed', { message: String(initErr) });
          emitSendOutcome(opts.hooks, 'stream_init');
          store.setState({ streaming: false });
          patchCurrentPanel({ streaming: false });
          opts.hooks?.onStreamState?.('error');
          const message =
            initErr instanceof Error ? initErr.message : 'Stream init failed';
          markUserDeliveryFailed(id, 'stream_init', message);
          opts.hooks?.onError?.(initErr);
          return { ok: false, code: 'stream_init', message };
        }

        subAgentObserver.suspend();
        const assistantId = `a_${Date.now()}`;
        let turns: ChatTurn[] = [
          ...store.getState().turns,
          {
            id: assistantId,
            role: 'assistant',
            text: '',
            toolEvents: [],
            rawToolStream: [],
            createdAt: new Date().toISOString(),
          },
        ];
        syncMessagesFromTurns(turns);
        patchCurrentPanel({
          streaming: true,
          conversationId: conversationId || store.getState().conversationId || null,
        });

        closeSocket();
        let wsConnected = false;
        if (streamResolver.getOrderedEndpoints().length > 0) {
          wsConnected = await streamResolver
            .connectWebSocket({
              onMessage: createLiveStreamMessageHandler({
                assistantId,
                panelId,
                requireGenerationStart: true,
              }),
            })
            .then((ws) => {
              activeSocket = ws as unknown as WebSocket;
              return true;
            })
            .catch((err) => {
              const failure = err as { url?: string; closeCode?: number | null; message?: string };
              const detail = {
                message: err instanceof Error ? err.message : String(err),
                url: failure.url ?? streamResolver.resolveWebSocketUrl(0),
                closeCode: failure.closeCode ?? null,
              };
              log('ws_connect_failed', detail);
              opts.logger?.warn?.('ws_connect_failed', detail);
              return false;
            });
        }

        const sentAtMs = Date.now();
        let replyWatermark: AssistantWatermark = emptyWatermark(false);
        const convBeforeSend = store.getState().conversationId || conversationId;
        if (!wsConnected && convBeforeSend && !roomId) {
          try {
            replyWatermark = watermarkFromMessages(await listConversationMessages(convBeforeSend));
          } catch (snapshotErr) {
            log('reply_snapshot_failed', {
              conversationId: convBeforeSend,
              message: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
            });
            replyWatermark = emptyWatermark(false);
          }
        }

        const command = roomId
          ? 'anx.communicate.rooms.message.send'
          : opts.agentSource === 'raw_models'
            ? 'anx.inference.chat.completions'
            : 'anx.communicate.message.send';
        const explicitTools = sendOpts.browserFunctionCalls ?? [];
        // Explicit per-send schemas win on name; registered and page tools fill
        // the rest. Page tools come from the open screen (setPageTools / `pageTools`).
        const autoTools = [...registeredToolSchemas(), ...pageToolSchemas()];
        const browserFunctionCalls =
          command === 'anx.communicate.message.send'
            ? [
                ...explicitTools,
                ...autoTools.filter((t) => !explicitTools.some((e) => e.name === t.name)),
              ]
            : explicitTools;
        // Discoverable client tools ride as a compact index (not tool schemas):
        // the model finds one through search and binds it on demand. On later
        // turns of the same conversation, when the host did not change the
        // registry, only the server-issued `clientToolIndexHash` is re-sent —
        // the server reads the index back from its Redis cache.
        const discoverableIndex =
          command === 'anx.communicate.message.send'
            ? sendOpts.clientToolIndex ?? clientToolIndexEntries()
            : sendOpts.clientToolIndex ?? [];
        const indexFingerprint = localClientToolIndexFingerprint(discoverableIndex);
        const conversationKeyForCache = store.getState().conversationId || conversationId || null;
        const priorIndexHash = clientToolIndexHashState;
        const canReuseIndexHash =
          command === 'anx.communicate.message.send' &&
          !sendOpts.clientToolIndex && // explicit per-send index always wins
          discoverableIndex.length > 0 &&
          !!indexFingerprint &&
          !!priorIndexHash &&
          !!priorIndexHash.hash &&
          priorIndexHash.fingerprint === indexFingerprint &&
          priorIndexHash.conversationId === conversationKeyForCache;
        const pageContext = normalizeHostPageContext(sendOpts.pageContext) ?? hostPageContext;
        // Page pointer (path / tiny prompt / entity ref) from the page-tool source,
        // only when the caller did not set that field for this send.
        const pointer = pageTools?.pointer?.() || null;
        const currentPagePath = sendOpts.currentPagePath ?? pointer?.path;
        const pageEntityRef = sendOpts.pageEntityRef ?? (pointer?.entityRef?.type ? pointer.entityRef : undefined);
        const explicitPrompts = sendOpts.injectedSystemPrompts || [];
        // The tiny pointer prompt rides along with any explicit prompts so a host
        // that also injects its own context keeps both.
        const injectedSystemPrompts =
          pointer?.prompt && !explicitPrompts.includes(pointer.prompt)
            ? [...explicitPrompts, pointer.prompt]
            : explicitPrompts.length
              ? explicitPrompts
              : undefined;
        // Plan Part C11 — app route context merges with (and never overrides) an
        // explicit per-send browserContext, so the portal path is untouched.
        const appRouteAsBrowser = appRouteToBrowserContext(appRouteContext);
        const browserContextOut = sendOpts.browserContext ?? appRouteAsBrowser;
        const result = (await opts.client.send(command, {
          text: sendOpts.conversationOpen ? '' : text,
          ...(sendOpts.conversationOpen ? { conversationOpen: true } : {}),
          message: command === 'anx.inference.chat.completions' ? text : undefined,
          conversationId: roomId ? undefined : store.getState().conversationId || conversationId,
          contactId: roomId || conversationId ? undefined : contactId,
          ...(roomId ? { roomId } : {}),
          ...(commandAttachments.length ? { attachments: commandAttachments } : {}),
          ...(sendOpts.modelOverride ? { modelOverride: sendOpts.modelOverride } : {}),
          ...(sendOpts.reasoningEffort ? { reasoningEffort: sendOpts.reasoningEffort } : {}),
          ...(sendOpts.uiLocale ? { uiLocale: sendOpts.uiLocale } : {}),
          ...(currentPagePath ? { currentPagePath } : {}),
          ...(pageContext ? { pageContext } : {}),
          ...(injectedSystemPrompts?.length
            ? { injectedSystemPrompts }
            : {}),
          ...(pageEntityRef?.type
            ? { pageEntityRef }
            : {}),
          ...(sendOpts.pageInstructions ? { pageInstructions: sendOpts.pageInstructions } : {}),
          ...(sendOpts.pageData ? { pageData: sendOpts.pageData } : {}),
          ...(browserContextOut ? { browserContext: browserContextOut } : {}),
          ...(browserFunctionCalls.length ? { browserFunctionCalls } : {}),
          ...(sendOpts.pageFunctionCalls?.length
            ? { pageFunctionCalls: sendOpts.pageFunctionCalls }
            : {}),
          ...(canReuseIndexHash && priorIndexHash?.hash
            ? { clientToolIndexHash: priorIndexHash.hash }
            : discoverableIndex.length
              ? { clientToolIndex: discoverableIndex }
              : {}),
          ...(sendOpts.clientToolIndexHash && !canReuseIndexHash && !discoverableIndex.length
            ? { clientToolIndexHash: sendOpts.clientToolIndexHash }
            : {}),
          ...(sendOpts.questionAnswer ? { questionAnswer: sendOpts.questionAnswer } : {}),
        })) as SendResult;

        if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
          if (result.kind === 'sca_required') {
            opts.hooks?.onScaRequired?.({
              authRequestId: result.authRequestId ?? null,
              command,
            });
          }
          if (result.kind === 'data_access_approval_required') {
            opts.hooks?.onDataAccessApproval?.(result.dataAccessApproval);
          }
          if (result.kind === 'permission_elevation_required') {
            opts.hooks?.onPermissionElevationRequired?.(result.permissionElevation ?? {
              elevationId: null,
              pack: null,
              reason: result.message || null,
            });
          }
          if (panelId) {
            applyThrottleToPanel(panelId, throttleFromFailure(result));
            const issue = classifyChatBillingIssue({
              kind: result.kind,
              code: result.error?.code,
              message: result.message,
            });
            if (issue) {
              mergePanelPatch(panelId, billingPatchFromIssue(issue));
            }
          }
          store.setState({ streaming: false });
          patchCurrentPanel({ streaming: false });
          opts.hooks?.onStreamState?.('error');
          closeSocket();
          emitSendOutcome(opts.hooks, 'command_error');
          const sessionCode = warnNexusSession(opts.logger, result, command);
          const message = result.message || sessionCode || result.kind || 'Send failed';
          const reported = sessionCode || result.kind || 'command_error';
          markUserDeliveryFailed(id, reported, message);
          if (sessionCode) {
            opts.hooks?.onError?.(commandFailureError(result, message));
          }
          return {
            ok: false,
            code: reported,
            message,
            kind: result.kind,
          };
        }

        const data = unwrapData(result);
        // Remember the server-issued index hash so later turns of this
        // conversation can send it instead of the whole index. Only the server
        // hash is stored — never sent back as a client-computed value.
        if (
          command === 'anx.communicate.message.send' &&
          discoverableIndex.length &&
          data &&
          typeof data === 'object' &&
          typeof (data as Record<string, unknown>).clientToolIndexHash === 'string'
        ) {
          clientToolIndexHashState = {
            hash: (data as Record<string, unknown>).clientToolIndexHash as string,
            fingerprint: indexFingerprint,
            conversationId: store.getState().conversationId || conversationId || null,
          };
        }
        if (sendOpts.conversationOpen) {
          const greetingText = typeof data.greetingText === 'string' ? data.greetingText.trim() : '';
          const dispatched = data.dispatched === true;
          if (greetingText) {
            const filled = store.getState().turns.map((turn) =>
              turn.id === assistantId ? { ...turn, text: greetingText } : turn,
            );
            syncMessagesFromTurns(filled);
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('idle');
            closeSocket();
            emitSendOutcome(opts.hooks, 'ok');
            return { ok: true, dispatched: false, greetingText };
          }
          if (!dispatched) {
            syncMessagesFromTurns(store.getState().turns.filter((turn) => turn.id !== assistantId));
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('idle');
            closeSocket();
            emitSendOutcome(opts.hooks, 'ok');
            return { ok: true, dispatched: false };
          }
          emitSendOutcome(opts.hooks, 'ok');
          return { ok: true, dispatched: true };
        }
        const aiDispatch = readAiDispatch(data);
        if (roomId && !shouldKeepRoomAssistantPlaceholder(aiDispatch)) {
          syncMessagesFromTurns(store.getState().turns.filter((t) => t.id !== assistantId));
          const skip = aiDispatch?.skippedReason || 'no_ai_participants';
          store.setState({ streaming: false, lastDispatchSkip: skip });
          patchCurrentPanel({ streaming: false });
          opts.hooks?.onStreamState?.('idle');
          closeSocket();
          emitSendOutcome(opts.hooks, 'ok');
          patchTurnById(id, { deliveryStatus: 'sent', deliveryError: null });
          return { ok: true, aiDispatch, dispatched: false };
        }
        if (roomId) store.setState({ lastDispatchSkip: null });
        if (panelId) {
          applyUsageToPanel(panelId, usageFromData(data));
          if (data.spendLimits && typeof data.spendLimits === 'object') {
            mergePanelPatch(panelId, { spendLimits: data.spendLimits as ChatSpendLimitsState });
          }
          if (data.credits && typeof data.credits === 'object') {
            const credits = data.credits as ChatCreditsState;
            mergePanelPatch(panelId, { credits });
            if (typeof credits.availableCents === 'number') {
              voice.signalBillingCredits(credits.availableCents);
            }
          }
          mergePanelPatch(panelId, { throttle: null, billingIssue: null });
        }

        if (lockedAgent && data?.conversationId) {
          const returnedId = String(data.conversationId).trim();
          const adopted = acceptLockedAgentSendConversation({
            locked: lockedAgent,
            returnedConversationId: returnedId,
            known: agentIndex.get(returnedId),
            createdConversationId: createdForLockedAgent,
          });
          if (!adopted.ok) {
            logLockedAgentRefusal(adopted);
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('error');
            closeSocket();
            emitSendOutcome(opts.hooks, 'client_preflight');
            const message = adopted.message;
            markUserDeliveryFailed(id, adopted.code, message);
            opts.hooks?.onError?.(new Error(message));
            return { ok: false, code: adopted.code, message };
          }
        }

        const linkedConversationId = String(
          data?.conversationId || store.getState().conversationId || conversationId || '',
        ).trim();
        if (linkedConversationId && commandAttachments.length) {
          await linkConversationAttachments(opts.client, {
            conversationId: linkedConversationId,
            attachments: commandAttachments,
            onError: ({ fileId, err }) => {
              log('workspace_link_failed', {
                conversationId: linkedConversationId,
                fileId,
                message: err instanceof Error ? err.message : String(err),
              });
            },
          });
        }

        if (data?.conversationId) {
          store.setState({ conversationId: String(data.conversationId) });
          patchCurrentPanel({ conversationId: String(data.conversationId) });
        }

        patchTurnById(id, { deliveryStatus: 'sent', deliveryError: null });
        turns = store.getState().turns;

        if (!wsConnected) {
          const inlineText =
            (typeof data.text === 'string' && data.text) ||
            (typeof data.content === 'string' && data.content) ||
            (typeof data.assistantText === 'string' && data.assistantText) ||
            '';
          const convId = store.getState().conversationId;
          let assistantText = inlineText;
          let toolCalls: Array<Record<string, unknown>> | undefined;
          if (!assistantText && convId && !roomId) {
            const newer = await pollNewerAssistantMessage({
              list: () => listConversationMessages(convId),
              watermark: replyWatermark,
              sentAtMs,
              intervalMs: opts.replyPoll?.intervalMs ?? 500,
              maxAttempts: opts.replyPoll?.maxAttempts ?? 20,
              onListError: (err, attempt) => {
                log('reply_poll_failed', {
                  conversationId: convId,
                  attempt,
                  message: err instanceof Error ? err.message : String(err),
                });
              },
            });
            if (newer) {
              assistantText = typeof newer.content === 'string' ? newer.content : '';
              toolCalls = newer.toolCalls;
            }
          }
          if (assistantText || toolCalls) {
            turns = store.getState().turns.map((t) =>
              t.id === assistantId
                ? {
                    ...t,
                    text: assistantText,
                    toolEvents: toolCalls
                      ? rehydrateToolRunsFromHistory(toolCalls)
                      : t.toolEvents,
                  }
                : t,
            );
            syncMessagesFromTurns(turns);
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('idle');
          } else if (!roomId) {
            const timeoutMessage = translate('replyTimedOut');
            log('reply_poll_timeout', { conversationId: convId || null });
            opts.logger?.warn?.('reply_poll_timeout', { conversationId: convId || null });
            turns = applyStreamEventToTurns(store.getState().turns, assistantId, {
              type: 'error',
              data: { message: timeoutMessage },
            });
            syncMessagesFromTurns(turns);
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onError?.(new Error(timeoutMessage));
            opts.hooks?.onStreamState?.('error');
          } else {
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('idle');
          }
        }
        emitSendOutcome(opts.hooks, 'ok');
        return { ok: true };
      } catch (err) {
        emitSendOutcome(opts.hooks, 'exception');
        store.setState({ streaming: false });
        patchCurrentPanel({ streaming: false });
        const message = err instanceof Error ? err.message : String(err);
        markUserDeliveryFailed(id, 'exception', message);
        opts.hooks?.onError?.(err);
        opts.hooks?.onStreamState?.('error');
        closeSocket();
        throw err;
      }
    },
    async compactConversation(compactOpts: {
      conversationId: string;
      compactPreserveIds?: string[];
    }) {
      const result = (await opts.client.send('anx.communicate.conversations.compact', {
        conversationId: compactOpts.conversationId,
        compactPreserveIds: compactOpts.compactPreserveIds,
      })) as {
        ok?: boolean;
        response?: { responseObject?: { conversationId?: string; compacted?: boolean } };
        responseObject?: { conversationId?: string; compacted?: boolean };
        message?: string;
      };
      if (result && result.ok === false) {
        throw new Error(result.message || 'Conversation compact failed');
      }
      const data =
        result?.response?.responseObject ?? result?.responseObject ?? (result as Record<string, unknown>);
      return {
        conversationId: String((data as { conversationId?: string })?.conversationId || compactOpts.conversationId),
        compacted: Boolean((data as { compacted?: boolean })?.compacted),
      };
    },
    async cancelConversation(cancelOpts: { conversationId: string }) {
      const result = (await opts.client.send('anx.communicate.conversations.cancel', {
        conversationId: cancelOpts.conversationId,
      })) as {
        ok?: boolean;
        response?: {
          responseObject?: { cancelled?: boolean; generationInProgress?: boolean };
        };
        responseObject?: { cancelled?: boolean; generationInProgress?: boolean };
        message?: string;
      };
      if (result && result.ok === false) {
        throw new Error(result.message || 'Conversation cancel failed');
      }
      // Stop composer streaming chrome immediately; upstream may still wind down.
      store.setState({ streaming: false });
      patchCurrentPanel({ streaming: false });
      opts.hooks?.onStreamState?.('idle');
      const data =
        result?.response?.responseObject ?? result?.responseObject ?? (result as Record<string, unknown>);
      const generationInProgress = Boolean(
        (data as { generationInProgress?: boolean })?.generationInProgress,
      );
      // Orphaned generation cleared server-side: no `done` will ever arrive.
      if (!generationInProgress && liveAttach) {
        settleLiveAttach('ended');
        closeSocket();
      }
      return {
        cancelled: Boolean((data as { cancelled?: boolean })?.cancelled),
        generationInProgress,
      };
    },
    async attachLiveGeneration(attachOpts: { conversationId: string }): Promise<LiveAttachResult> {
      const conversationId = String(attachOpts?.conversationId || '').trim();
      if (!conversationId) return resumeObserverAfter({ attached: false, outcome: 'not_live' });
      if (store.getState().conversationId !== conversationId) {
        log('live_attach_skip', { reason: 'conversation_mismatch', conversationId });
        return resumeObserverAfter({ attached: false, outcome: 'not_live' });
      }
      if (hasLiveStream()) {
        // A send / resume in this tab already owns the socket for this turn.
        log('live_attach_skip', { reason: 'socket_active', conversationId });
        return resumeObserverAfter({ attached: false, outcome: 'not_live' });
      }
      subAgentObserver.suspend();

      try {
        await streamInit({ conversationId });
      } catch (err) {
        opts.logger?.warn?.('live_attach_stream_init_failed', { conversationId, message: String(err) });
        return resumeObserverAfter({ attached: false, outcome: 'failed' });
      }
      // A send/switch may have happened while stream-init was in flight.
      if (store.getState().conversationId !== conversationId || hasLiveStream()) {
        return resumeObserverAfter({ attached: false, outcome: 'superseded' });
      }
      if (streamResolver.getOrderedEndpoints().length === 0) {
        opts.logger?.warn?.('live_attach_no_endpoints', { conversationId });
        return resumeObserverAfter({ attached: false, outcome: 'failed' });
      }

      let generationLive = false;
      try {
        const liveRes = (await opts.client.send('anx.communicate.conversations.get', {
          conversationId,
        })) as { ok?: boolean } | null;
        if (!liveRes || liveRes.ok !== false) {
          generationLive = unwrapData(liveRes).generationInProgress === true;
        }
      } catch (err) {
        opts.logger?.warn?.('live_attach_liveness_check_failed', {
          conversationId,
          message: String(err),
        });
        generationLive = false;
      }
      if (!generationLive) {
        log('live_attach_skip', { reason: 'not_live', conversationId });
        return resumeObserverAfter({ attached: false, outcome: 'not_live' });
      }
      if (store.getState().conversationId !== conversationId || hasLiveStream()) {
        return resumeObserverAfter({ attached: false, outcome: 'superseded' });
      }

      const panelId = currentPanel(store.getState())?.id;
      const assistantId = `a_live_${Date.now()}`;
      syncMessagesFromTurns([
        ...store.getState().turns,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          toolEvents: [],
          rawToolStream: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      store.setState({ streaming: true });
      patchCurrentPanel({ streaming: true });
      opts.hooks?.onStreamState?.('streaming');

      const dropEmptyLiveTurn = () => {
        const current = store.getState().turns;
        if (isEmptyAssistantTurn(current.find((t) => t.id === assistantId))) {
          syncMessagesFromTurns(current.filter((t) => t.id !== assistantId));
        }
      };
      const stopStreamingChrome = () => {
        if (!store.getState().streaming) return;
        store.setState({ streaming: false });
        patchCurrentPanel({ streaming: false });
        opts.hooks?.onStreamState?.('idle');
      };

      const session = new LiveAttachSession({
        checkLive: async () => {
          try {
            const res = (await opts.client.send('anx.communicate.conversations.get', {
              conversationId,
            })) as { ok?: boolean } | null;
            if (res && res.ok === false) return true;
            return unwrapData(res).generationInProgress === true;
          } catch (err) {
            // Transport hiccup is not evidence the generation ended.
            opts.logger?.warn?.('live_attach_liveness_check_failed', { conversationId, message: String(err) });
            return true;
          }
        },
        onEnded: () => {
          log('live_attach_ended_silently', { conversationId });
          closeSocket();
        },
      });
      const inner = createLiveStreamMessageHandler({
        assistantId,
        panelId,
        requireGenerationStart: false,
      });

      const ws = await streamResolver
        .connectWebSocket({
          onMessage: (ev) => {
            session.noteEvent(parseStreamMessage(ev.data)?.type);
            inner(ev);
          },
          onClose: () => {
            // Server/network closed the socket without a terminal event.
            if (liveAttach === session) {
              activeSocket = null;
              settleLiveAttach('ended');
            }
          },
        })
        .catch((err) => {
          opts.logger?.warn?.('live_attach_ws_connect_failed', { conversationId, message: String(err) });
          return null;
        });
      if (!ws) {
        session.settle('failed');
        stopStreamingChrome();
        dropEmptyLiveTurn();
        return resumeObserverAfter({ attached: false, outcome: 'failed' });
      }
      if (store.getState().conversationId !== conversationId || hasLiveStream()) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        session.settle('superseded');
        dropEmptyLiveTurn();
        return resumeObserverAfter({ attached: false, outcome: 'superseded' });
      }
      activeSocket = ws as unknown as WebSocket;
      liveAttach = session;
      liveAttachCleanup = (outcome) => {
        // done / error / paused already reset streaming in the stream handler;
        // superseded means a new send owns the streaming chrome now.
        if (outcome === 'ended') stopStreamingChrome();
        dropEmptyLiveTurn();
      };
      log('live_attach_open', { conversationId });

      const result = await session.promise;
      log('live_attach_settled', { conversationId, outcome: result.outcome });
      return result;
    },
    detachLiveGeneration() {
      if (!liveAttach) return;
      closeSocket();
      store.setState({ streaming: false });
      patchCurrentPanel({ streaming: false });
    },
    async resumeClientTool(resumeOpts: {
      callId: string;
      result: unknown;
      conversationId?: string;
    }) {
      const conversationId =
        resumeOpts.conversationId || store.getState().conversationId || undefined;
      if (!conversationId) {
        return { ok: false, message: 'conversationId required' };
      }
      const callId = String(resumeOpts.callId || '').trim();
      if (!callId) return { ok: false, message: 'callId required' };
      const gated = guardLockedChannel({
        conversationId,
        requireKnownConversation: true,
      });
      if (!gated.ok) {
        logLockedAgentRefusal(gated);
        return { ok: false, code: gated.code, message: gated.message };
      }

      const panel = currentPanel(store.getState());
      const panelId = panel?.id;
      const assistantId = `a_resume_${Date.now()}`;
      let turns: ChatTurn[] = [
        ...store.getState().turns,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          toolEvents: [],
          rawToolStream: [],
          createdAt: new Date().toISOString(),
        },
      ];
      syncMessagesFromTurns(turns);
      store.setState({
        streaming: true,
        pausedCallId: null,
        pendingPauseKind: null,
        pendingPause: null,
      });
      patchCurrentPanel({ streaming: true, pausedCallId: null, pendingPauseKind: null, pendingPause: null });
      opts.hooks?.onStreamState?.('streaming');

      try {
        closeSocket();
        let acceptStreamTokens = false;
        const wsConnected = await streamResolver
          .connectWebSocket({
            onMessage: (ev) => {
              const parsed = parseStreamMessage(ev.data);
              if (!parsed) return;
              if (parsed.type === 'dispatch-plan' || parsed.type === 'rooms:dispatch-plan') {
                const plan =
                  parsed.data && typeof parsed.data === 'object'
                    ? (parsed.data as { responders?: unknown[]; skippedReason?: string | null })
                    : null;
                const applied = applyRoomDispatchPlan(store.getState().turns, assistantId, plan);
                if (applied.dropped || applied.lastDispatchSkip) {
                  turns = applied.turns;
                  syncMessagesFromTurns(turns);
                  store.setState({
                    streaming: applied.dropped ? false : store.getState().streaming,
                    lastDispatchSkip: applied.lastDispatchSkip,
                  });
                  if (applied.dropped) {
                    patchCurrentPanel({ streaming: false });
                    opts.hooks?.onStreamState?.('idle');
                  }
                }
                return;
              }
              let pendingPause = false;
              if (
                parsed.type === 'conversation' &&
                parsed.data &&
                typeof parsed.data === 'object' &&
                (parsed.data as { generationStart?: unknown }).generationStart === true
              ) {
                acceptStreamTokens = true;
              } else if (
                (parsed.type === 'token' ||
                  parsed.type === 'sub_agent_token' ||
                  parsed.type === 'turn_snapshot') &&
                !acceptStreamTokens
              ) {
                return;
              }
              turns = applyStreamEventToTurns(store.getState().turns, assistantId, parsed);
              syncMessagesFromTurns(turns);
              if (panelId && parsed.type === 'usage') {
                const turnUsage = turns.find((t) => t.id === assistantId)?.usage || null;
                applyUsageToPanel(panelId, turnUsage);
              }
              if (parsed.type === 'chat_command') {
                const command = parsed.data && typeof parsed.data === 'object'
                  ? parsed.data as { name?: string; modelId?: string; hostingType?: string | null }
                  : null;
                if (command) opts.hooks?.onChatCommand?.(command);
              }
              if (parsed.type === 'mode_changed') {
                const change = parseModeChangedEvent(parsed.data);
                if (change) opts.hooks?.onModeChanged?.(change);
              }
              if (
                parsed.type === 'client_tool_request' ||
                parsed.type === 'approval_request' ||
                parsed.type === 'mode_switch_request'
              ) {
                const data = (parsed.data || {}) as Record<string, unknown>;
                const nextCallId = String(data.callId || '');
                const name = String(data.name || data.command || '');
                if (nextCallId) {
                  pendingPause = true;
                  void Promise.resolve(
                    handlePendingPause({
                      kind: normalizePendingPauseKind(
                        parsed.type === 'client_tool_request'
                          ? data.kind
                          : parsed.type.replace('_request', ''),
                      ),
                      callId: nextCallId,
                      name,
                      arguments:
                        data.arguments && typeof data.arguments === 'object'
                          ? (data.arguments as Record<string, unknown>)
                          : {},
                      conversationId,
                      requiresApproval: data.requiresApproval === true,
                      action: data.action === 'bind' ? 'bind' : 'request',
                    }),
                  ).catch((err) => opts.hooks?.onError?.(err));
                }
              }
              if (parsed.type === 'data_access_approval_request') {
                emitDataAccessApprovalOnce(dataAccessApprovalInfoFrom(parsed.data));
              }
              if (
                parsed.type === 'paused' ||
                parsed.type === 'done' ||
                parsed.type === 'complete' ||
                parsed.type === 'finished' ||
                parsed.type === 'error'
              ) {
                // Deny / re-prompt / tool-row-only outcomes land on the original turn;
                // drop the placeholder resume bubble when nothing reached it.
                const current = store.getState().turns;
                const placeholder = current.find((t) => t.id === assistantId);
                if (isEmptyAssistantTurn(placeholder)) {
                  syncMessagesFromTurns(current.filter((t) => t.id !== assistantId));
                }
              }
              if (parsed.type === 'paused') {
                if (!pendingPause && !store.getState().pausedCallId) {
                  store.setState({ streaming: false });
                  patchCurrentPanel({ streaming: false });
                  opts.hooks?.onStreamState?.('paused');
                  closeSocket();
                }
              }
              if (
                parsed.type === 'done' ||
                parsed.type === 'complete' ||
                parsed.type === 'finished' ||
                parsed.type === 'error'
              ) {
                if (parsed.type === 'error') {
                  const errData =
                    parsed.data && typeof parsed.data === 'object'
                      ? (parsed.data as Record<string, unknown>)
                      : {};
                  const errMsg =
                    (typeof parsed.data === 'string' && parsed.data) ||
                    (typeof errData.message === 'string' && errData.message) ||
                    'Stream error';
                  const billing = classifyChatBillingIssue({
                    code: errData.code,
                    message: errMsg,
                  });
                  if (!billing) {
                    opts.hooks?.onError?.(new Error(errMsg));
                  } else if (typeof billing.message === 'string' && billing.message) {
                    opts.hooks?.onError?.(new Error(billing.message));
                  }
                }
                store.setState({ streaming: false });
                patchCurrentPanel({ streaming: false });
                opts.hooks?.onStreamState?.(parsed.type === 'error' ? 'error' : 'idle');
                closeSocket();
              }
            },
          })
          .then((ws) => {
            activeSocket = ws as unknown as WebSocket;
            return true;
          })
          .catch(() => false);

        await streamInit({ conversationId });

        const result = (await opts.client.send('anx.communicate.client-tool.result', {
          conversationId,
          callId,
          result: resumeOpts.result,
        })) as SendResult;

        if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
          const fail = result as {
            message?: string;
            code?: string;
            kind?: string;
            error?: { code?: string; message?: string };
          };
          const failMsg = fail.message || fail.error?.message || 'client-tool resume failed';
          const failCode = fail.code || fail.error?.code || fail.kind || null;
          const noPending =
            failCode === 'NO_PENDING_CLIENT_TOOL' ||
            /no pending client tool/i.test(failMsg);
          // Expected when approving a data-access grant from a turn that
          // finished before pause was recorded — host falls back to follow-up.
          if (noPending) {
            store.setState({ streaming: false, pausedCallId: null });
            patchCurrentPanel({ streaming: false });
            closeSocket();
            // Drop the empty resume assistant turn we just appended.
            const withoutEmpty = store
              .getState()
              .turns.filter((t) => t.id !== assistantId);
            syncMessagesFromTurns(withoutEmpty);
            return {
              ok: false,
              code: 'NO_PENDING_CLIENT_TOOL',
              message: failMsg,
            };
          }
          turns = applyStreamEventToTurns(store.getState().turns, assistantId, {
            type: 'error',
            data: { message: failMsg },
          });
          syncMessagesFromTurns(turns);
          store.setState({ streaming: false });
          patchCurrentPanel({ streaming: false });
          closeSocket();
          opts.hooks?.onError?.(new Error(failMsg));
          return { ok: false, message: failMsg, code: failCode || undefined };
        }

        if (!wsConnected) {
          store.setState({ streaming: false });
          patchCurrentPanel({ streaming: false });
        }
        return { ok: true };
      } catch (err) {
        store.setState({ streaming: false });
        patchCurrentPanel({ streaming: false });
        closeSocket();
        const message = err instanceof Error ? err.message : String(err);
        opts.hooks?.onError?.(err);
        return { ok: false, message };
      }
    },
    resolveApproval(approvalOpts) {
      return controller.resumeClientTool({
        callId: approvalOpts.callId,
        result: {
          approved: approvalOpts.approved === true,
          ...(approvalOpts.switchToMode ? { switchToMode: approvalOpts.switchToMode } : {}),
        },
        conversationId: approvalOpts.conversationId,
      });
    },
    resolveModeSwitch(switchOpts) {
      return controller.resumeClientTool({
        callId: switchOpts.callId,
        result: {
          approved: switchOpts.approved === true,
          ...(switchOpts.to ? { to: switchOpts.to } : {}),
        },
        conversationId: switchOpts.conversationId,
      });
    },
    answerQuestion(questionOpts) {
      const answer = buildQuestionAnswer({
        questionId: questionOpts.questionId,
        selectedIds: questionOpts.selectedIds,
        customText: questionOpts.customText,
        explanation: questionOpts.explanation,
        persist: questionOpts.persist ?? null,
      });
      return controller.sendMessage(
        answer.selectedIds.join(', ') || answer.customText || '',
        {
          conversationId: questionOpts.conversationId,
          questionAnswer: answer,
        },
      );
    },
    getPendingPause() {
      return store.getState().pendingPause ?? null;
    },
    seedPendingPause(card) {
      const next = card ?? null;
      store.setState({
        pendingPause: next,
        pendingPauseKind: next?.kind ?? null,
        pausedCallId: next?.callId ?? null,
      });
    },
    applySubAgentRunStates(runs) {
      return applyRunStates(Array.isArray(runs) ? runs : []);
    },
    applySubAgentActivity(data) {
      return applySubAgentActivity(data);
    },
    observeSubAgents(observeOpts) {
      const conversationId =
        typeof observeOpts?.conversationId === 'string' ? observeOpts.conversationId : null;
      subAgentObserver.setTarget(conversationId);
    },
  };

  if (lockedAgent) {
    const contact = lockedAgentContact(lockedAgent);
    const remembered = readLockedThread(browserLockedThreadStorage(), lockedAgent.virtualEmployeeId);
    store.setState({
      contacts: [contact],
      selectedAgentId: contact.id,
      ...(remembered?.conversationId ? { conversationId: remembered.conversationId } : {}),
    });
    patchCurrentPanel({
      contactId: contact.id,
      contactType: 'agent',
      conversationId: remembered?.conversationId || null,
      roomId: null,
      roomPurpose: 'conversation',
    });
    if (remembered?.conversationId && remembered.greetingText) {
      keepLockedGreeting(remembered.conversationId, remembered.greetingText);
    }
    whenLockedAgentReady = fallbackTransportSelected(opts.fallbackTransport)
      ? Promise.resolve(null)
      : ensureLockedAgentConversation(lockedAgent);
  }

  return controller;

  async function ensureLockedAgentConversation(locked: LockedAgent) {
    const key = locked.virtualEmployeeId;
    const pending = lockedOpenInflight.get(key);
    if (pending) {
      const shared = await pending;
      await adoptLockedConversation(locked, shared);
      return { conversationId: shared.conversationId, created: false as const };
    }
    const run = openLockedAgentConversation(locked);
    lockedOpenInflight.set(key, run);
    try {
      const result = await run;
      return { conversationId: result.conversationId, created: result.created };
    } finally {
      lockedOpenInflight.delete(key);
    }
  }

  function rehydrateLockedHistory(conversationId: string, messages: unknown[]) {
    const rows = rehydrateRowsFromMessages(messages);
    const serverHasText = rows.some((row) => String(row.content || row.text || '').trim());
    const localGreeting = store
      .getState()
      .turns.some((turn) => turn.role === 'assistant' && turn.text.trim());
    if (!serverHasText && localGreeting) return;
    controller.rehydrateTurns(rows, { conversationId, detachStream: true });
  }

  function keepLockedGreeting(conversationId: string, text: string | null | undefined) {
    const greeting = typeof text === 'string' ? text.trim() : '';
    if (!conversationId || !greeting) return;
    const turns = store.getState().turns;
    if (turns.some((turn) => turn.role === 'assistant' && turn.text.trim())) return;
    syncMessagesFromTurns([
      ...turns,
      {
        id: `a_open_${conversationId}`,
        role: 'assistant',
        text: greeting,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  async function adoptLockedConversation(
    locked: LockedAgent,
    shared: { conversationId: string; greetingText?: string | null },
  ) {
    const contact = lockedAgentContact(locked);
    if (!shared.conversationId) return;
    store.setState({
      conversationId: shared.conversationId,
      selectedAgentId: contact.id,
    });
    patchCurrentPanel({
      contactId: contact.id,
      contactType: 'agent',
      conversationId: shared.conversationId,
      roomId: null,
      roomPurpose: 'conversation',
    });
    try {
      const messages = await controller.listMessages(shared.conversationId, { limit: 50 });
      rehydrateLockedHistory(shared.conversationId, messages);
    } catch (err) {
      opts.logger?.warn?.('locked_agent_history_failed', {
        virtualEmployeeId: locked.virtualEmployeeId,
        conversationId: shared.conversationId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    keepLockedGreeting(shared.conversationId, shared.greetingText);
    const stillEmpty = !store
      .getState()
      .turns.some((turn) => turn.role === 'assistant' && turn.text.trim());
    if (stillEmpty) {
      try {
        await controller.attachLiveGeneration({ conversationId: shared.conversationId });
      } catch (err) {
        opts.logger?.warn?.('locked_agent_live_attach_failed', {
          virtualEmployeeId: locked.virtualEmployeeId,
          conversationId: shared.conversationId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async function openLockedAgentConversation(locked: LockedAgent) {
    const virtualEmployeeId = locked.virtualEmployeeId;
    const contact = lockedAgentContact(locked);
    opts.logger?.debug?.('locked_agent_open_start', { virtualEmployeeId });
    try {
      const storage = browserLockedThreadStorage();
      const remembered = readLockedThread(storage, virtualEmployeeId);
      const rememberedGreeting = remembered?.greetingText?.trim() || '';
      let opened: { conversationId: string; created: boolean } | null = null;
      let openedUsage: ChatUsageSnapshot | null = null;
      if (remembered?.conversationId) {
        try {
          const got = await opts.client.send('anx.communicate.conversations.get', {
            conversationId: remembered.conversationId,
          });
          const failed =
            got && typeof got === 'object' && 'ok' in got && (got as { ok?: boolean }).ok === false;
          if (!failed) {
            const data = unwrapData(got);
            const ve = String(data.virtualEmployeeId || data.anxVeId || '').trim();
            const serverAgentId = typeof data.agentId === 'string' ? data.agentId.trim() : '';
            if (!ve || ve === virtualEmployeeId) {
              if (serverAgentId) {
                store.setState({
                  contacts: store.getState().contacts.map((entry) =>
                    entry.id === contact.id ? { ...entry, agentId: serverAgentId } : entry,
                  ),
                });
              }
              agentIndex.remember({
                conversationId: remembered.conversationId,
                virtualEmployeeId,
                agentId: serverAgentId || null,
                contactId: contact.id,
              });
              store.setState({
                conversationId: remembered.conversationId,
                selectedAgentId: contact.id,
              });
              patchCurrentPanel({
                contactId: contact.id,
                contactType: 'agent',
                conversationId: remembered.conversationId,
                roomId: null,
                roomPurpose: 'conversation',
              });
              opened = { conversationId: remembered.conversationId, created: false };
              if (data.usage && typeof data.usage === 'object') {
                openedUsage = data.usage as ChatUsageSnapshot;
              }
            }
          }
        } catch (err) {
          opts.logger?.warn?.('locked_agent_reuse_failed', {
            virtualEmployeeId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (!opened) opened = await controller.openLatest(contact);
      const conversationId = opened.conversationId;
      if (conversationId) {
        writeLockedThread(storage, virtualEmployeeId, { conversationId, agentId: null });
      }
      if (conversationId && !opened.created) {
        try {
          const messages = await controller.listMessages(conversationId, { limit: 50 });
          rehydrateLockedHistory(conversationId, messages);
        } catch (err) {
          opts.logger?.warn?.('locked_agent_history_failed', {
            virtualEmployeeId,
            conversationId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (conversationId && !openedUsage && !opened.created) {
        try {
          const got = await opts.client.send('anx.communicate.conversations.get', { conversationId });
          const failed = got && typeof got === 'object' && 'ok' in got && (got as { ok?: boolean }).ok === false;
          if (!failed) {
            const data = unwrapData(got);
            if (data.usage && typeof data.usage === 'object') {
              openedUsage = data.usage as ChatUsageSnapshot;
            }
          }
        } catch (err) {
          opts.logger?.warn?.('locked_agent_usage_failed', {
            virtualEmployeeId,
            conversationId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (openedUsage) {
        const panel = currentPanel(store.getState());
        if (panel?.id) applyUsageToPanel(panel.id, openedUsage);
      }
      let greetingText: string | null = null;
      if (conversationId) {
        const turnsNow = store.getState().turns;
        const hasAssistant = turnsNow.some((turn) => turn.role === 'assistant' && turn.text.trim());
        const hasUser = turnsNow.some((turn) => turn.role === 'user' && turn.text.trim());
        if (!hasAssistant && !hasUser && !openingRequested.has(conversationId)) {
          openingRequested.add(conversationId);
          try {
            const sent = await controller.sendMessage('', {
              conversationId,
              conversationOpen: true,
              bypassFallback: true,
            });
            if (!sent.ok) openingRequested.delete(conversationId);
            else if (sent.greetingText) greetingText = sent.greetingText;
          } catch (err) {
            openingRequested.delete(conversationId);
            opts.logger?.warn?.('locked_agent_opening_failed', {
              virtualEmployeeId,
              conversationId,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (!hasAssistant && !hasUser && rememberedGreeting) {
          greetingText = rememberedGreeting;
          keepLockedGreeting(conversationId, rememberedGreeting);
        }
        if (greetingText) {
          writeLockedThread(storage, virtualEmployeeId, {
            conversationId,
            agentId: null,
            greetingText,
          });
        }
      }
      if (conversationId) {
        try {
          await controller.streamInit({ conversationId, contactId: contact.id });
        } catch (err) {
          opts.logger?.warn?.('locked_agent_stream_init_failed', {
            virtualEmployeeId,
            conversationId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        if (streamResolver.getOrderedEndpoints().length > 0 && !store.getState().streaming) {
          controller.observeSubAgents({ conversationId });
          try {
            await controller.attachLiveGeneration({ conversationId });
          } catch (err) {
            opts.logger?.warn?.('locked_agent_live_attach_failed', {
              virtualEmployeeId,
              conversationId,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
        try {
          const rows = await controller.listConversations({ status: 'active', limit: 50 });
          const openedRow = rows.find((row) => {
            const id = String(row.conversationId || row.id || '').trim();
            return id === conversationId;
          });
          const named = rows.find(
            (row) => typeof row.agentName === 'string' && String(row.agentName).trim(),
          );
          const serverName =
            (typeof openedRow?.agentName === 'string' && openedRow.agentName) ||
            (named ? String(named.agentName) : '');
          const label = lockedAgentVisibleName(locked, serverName);
          const serverAvatar =
            (typeof openedRow?.avatarUrl === 'string' && openedRow.avatarUrl) ||
            (typeof openedRow?.profilePicture === 'string' && openedRow.profilePicture) ||
            '';
          const rowAgentId =
            (typeof openedRow?.agentId === 'string' && openedRow.agentId.trim()) || '';
          store.setState({
            contacts: store.getState().contacts.map((entry) =>
              entry.id === contact.id
                ? {
                    ...entry,
                    name: label,
                    avatarUrl: resolveDisplayAvatar(locked.avatarUrl, serverAvatar || entry.avatarUrl),
                    ...(rowAgentId ? { agentId: rowAgentId } : {}),
                  }
                : entry,
            ),
          });
        } catch (err) {
          opts.logger?.warn?.('locked_agent_name_failed', {
            virtualEmployeeId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      opts.logger?.debug?.('locked_agent_open_ready', {
        virtualEmployeeId,
        conversationId: conversationId || null,
        created: opened.created,
      });
      return { conversationId, created: opened.created, greetingText };
    } catch (err) {
      opts.logger?.warn?.('locked_agent_open_failed', {
        virtualEmployeeId,
        message: err instanceof Error ? err.message : String(err),
      });
      opts.hooks?.onError?.(err);
      throw err;
    }
  }
}

export {
  applyAccessDecision,
  applyTurnFailure,
  initialFundingGate,
  selectFunding,
  paidModesOffered,
  canSwitchFunding,
} from './access/gate.js';
export { guestContinuePresentation } from './access/guest-continue.js';
export type { GuestContinueInput, GuestContinuePresentation, GuestContinueSurface } from './access/guest-continue.js';
export { annotateCoverage, coverageByModality, rowCoversModality } from './access/coverage.js';
export {
  createAgentAccessClient,
  unwrapCommand,
  AgentAccessCommandError,
} from './access/commands.js';
export type { AgentAccessClient, AccessCommandClient, CommandOutcome } from './access/commands.js';
export { formatMillicents, formatMinor, fundingQuickSelectModel } from './access/present.js';
export type { FundingQuickSelectModel } from './access/present.js';
export type {
  AccessDecision,
  AgentAccessTarget,
  CoverageRow,
  FundingGatePhase,
  FundingGateState,
  SubscriptionLimitSwitch,
  FundedModality,
} from './access/types.js';

export function assertAiDisclosureAlwaysOn(state: ChatState): void {
  if (state.aiDisclosureVisible !== true) {
    throw new Error('AI disclosure must remain visible');
  }
  if ('hideAiDisclosure' in (state.features as object)) {
    throw new Error('hideAiDisclosure is not a valid feature flag');
  }
}
