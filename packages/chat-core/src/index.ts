import type {
  ChatTransport,
  AgentSource,
  ChatFeatures,
  ChatHooks,
  ChatSendOutcomeCode,
  ChatToolDescriptor,
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
import { StreamEndpointResolver } from './stream/stream-endpoint-resolver.js';
import { parseStreamMessage, applyStreamEventToTurns } from './stream/stream-events.js';
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
  type BrowserCallRuntimeOptions,
  type VoiceCallSurface,
  type VoiceBridgeEventPayload,
} from './voice.js';
import {
  uploadAttachment as uploadAttachmentViaRegion,
  type UploadAttachmentResult,
  type UploadAttachmentOpts,
} from './tools/upload-attachment.js';

function elevationCommandNames(elev: {
  command?: string | null;
  commandNames?: string[];
  resume?: { command?: string };
}): string[] {
  const names = Array.isArray(elev.commandNames)
    ? elev.commandNames.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];
  const single =
    (typeof elev.command === 'string' && elev.command.trim()) ||
    (typeof elev.resume?.command === 'string' && elev.resume.command.trim()) ||
    '';
  if (single && !names.includes(single)) names.unshift(single);
  return names;
}

export type {
  ChatTransport,
  AgentSource,
  ChatFeatures,
  ChatHooks,
  ChatSendOutcomeCode,
  ChatToolDescriptor,
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
export { DEFAULT_FEATURES, AI_DISCLOSURE_REQUIRED } from './types.js';
export type { ChatTurn, ChatDeliveryStatus, PanelState, ChatToolRun, ChatToolRunStatus, SubAgentFinalStatus } from './state.js';
export {
  inferSupportsReasoning,
  modelSupportsToolCalling,
  isChatAgentPickerModel,
  formatCatalogModelLabel,
  NON_CHAT_AGENT_CAPABILITIES,
  NON_CHAT_AGENT_CATEGORIES,
} from './model-capabilities.js';
export type { ChatPickerModelFields } from './model-capabilities.js';
export { StreamEndpointResolver } from './stream/stream-endpoint-resolver.js';
export { parseStreamMessage, applyStreamEventToTurns } from './stream/stream-events.js';
export {
  classifyChatBillingIssue,
  isChatBillingIssueCode,
} from './billing/classify-billing-issue.js';
export { pollWorkload, BrowserCallRuntime, createVoiceApi };
export type { WorkloadPollOptions, BrowserCallRuntimeOptions, VoiceCallSurface, VoiceBridgeEventPayload };
export {
  listAudioModels,
  createSttJob,
  getSttJobResult,
  pollSttJob,
  createAndPollTts,
  playAudioUrl,
} from './voice/stt-tts.js';
export type {
  AudioModalityFilter,
  AudioModelListItem,
  SttCreateResult,
  SttGetResult,
  SttPollOptions,
  TtsPlaybackResult,
} from './voice/stt-tts.js';
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
} from './mode-transition.js';
export type {
  ChatExecutionMode,
  ModeTransitionPhase,
  ModeTransitionState,
  ModeTransitionListener,
  ModeTransitionOptions,
  ModeTransitionController,
} from './mode-transition.js';
export {
  uploadAttachment,
  conversationAttachmentDescriptor,
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
  parsePresentFileItem,
  parsePresentFileItems,
  presentFileKind,
  parseMediaImages,
  parseWorkloadMediaImages,
  parseMediaAudioUrl,
  parseMediaWorkloadId,
  parseUserChoiceOptions,
} from './tools/index.js';
export type {
  ScheduleCheckBackResult,
  PresentFileItem,
  MediaCarouselImage,
  UserChoiceOption,
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

export const DEFAULT_I18N = {
  messageAccepted: '(message accepted)',
  awaitingResponse: 'Awaiting response...',
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

function attachmentRefs(attachments: IoDescriptor[] | undefined): string[] {
  return (attachments || [])
    .filter(
      (attachment): attachment is Extract<IoDescriptor, { kind: 'entity' }> =>
        attachment.kind === 'entity' && attachment.entityType === 'conversation_attachment',
    )
    .map((attachment) => attachment.ref)
    .filter(Boolean);
}

function usageFromData(data: Record<string, unknown>): ChatUsageSnapshot | null {
  const hasUsage =
    typeof data.tokensUsed === 'number' ||
    typeof data.maxContextTokens === 'number' ||
    typeof data.costCents === 'number' ||
    typeof data.creditsCents === 'number' ||
    typeof data.displayCostMinor === 'number' ||
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
        avatarUrl,
        avatarRef,
        aliases: aliases.length ? Array.from(new Set(aliases)) : undefined,
        canConfigure: opts?.canConfigure === true,
        responsibleUserId: row?.responsibleUserId ? String(row.responsibleUserId) : null,
        orgId: row?.orgId ? String(row.orgId) : null,
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

/** Resolve a contact by canonical id, alias, virtualEmployeeId, or agentId. */
export function findChatContact(
  contacts: ChatContact[] | undefined | null,
  contactId: string | null | undefined,
): ChatContact | null {
  const id = contactId == null ? '' : String(contactId).trim();
  if (!id || !Array.isArray(contacts)) return null;
  return (
    contacts.find(
      (c) =>
        c.id === id ||
        c.virtualEmployeeId === id ||
        c.agentId === id ||
        (Array.isArray(c.aliases) && c.aliases.includes(id)),
    ) || null
  );
}

export type SendMessageResult =
  | { ok: true }
  | { ok: false; code: string; message: string; kind?: string };

function emitSendOutcome(hooks: ChatHooks | undefined, code: ChatSendOutcomeCode): void {
  try {
    hooks?.onSendOutcome?.(code);
  } catch {
    // Host hooks must not break send flow.
  }
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

export type NexusChat = {
  getState: () => ChatState;
  subscribe: (listener: Listener) => () => void;
  /** Get structured summary (topics + todos) for a conversation. */
  getConversationSummary: (conversationId: string) => Promise<ConversationSummaryResult>;
  sendMessage: (
    text: string,
    opts?: {
      conversationId?: string;
      contactId?: string;
      roomId?: string;
      attachments?: IoDescriptor[];
      modelOverride?: import('./types').ChatModelOverride;
      reasoningEffort?: 'low' | 'medium' | 'high';
      uiLocale?: string;
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
  loadContacts: () => Promise<void>;
  /** Create a new conversation for an agent contact (VE id or agent id). Always allocates a new id. */
  openContact: (contactId: string, opts?: { title?: string }) => Promise<{ conversationId: string; agentId?: string }>;
  streamInit: (opts: { conversationId?: string; contactId?: string; roomId?: string }) => Promise<void>;
  listRooms: () => Promise<ChatRoomSummary[]>;
  createRoom: (input: {
    title?: string;
    type?: 'dm' | 'group';
    encryptionMode?: 'server_group_v1' | 'client_v1';
    participants?: Array<{
      type: 'user' | 'agent' | 'virtual_agent';
      id: string;
      role?: string;
      displayName?: string;
    }>;
    /** AI contacts to add after create (`agent` / `virtual_agent`). */
    aiParticipants?: Array<{ type: 'agent' | 'virtual_agent'; id: string; displayName?: string }>;
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
      type: 'user' | 'agent' | 'virtual_agent';
      id: string;
      role?: string;
      displayName?: string;
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
  createBrowserCall: (agentId: string, conversationId?: string | null) => Promise<ChatVoiceCallSession>;
  /** Full WebRTC browser call: create → getUserMedia → offer → realtime.call.create → answer. */
  startBrowserCall: (input: {
    agentId: string;
    conversationId?: string | null;
    virtualAgentId?: string | null;
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
  rehydrateTurns: (
    rows: Array<{
      id?: string;
      role: string;
      content?: string;
      text?: string;
      toolCalls?: Array<Record<string, unknown>>;
      attachments?: IoDescriptor[];
    }>,
    opts?: { conversationId?: string | null },
  ) => void;
  /** Apply persisted conversation usage / context snapshot (e.g. from conversations.get). */
  applyUsage: (usage: ChatUsageSnapshot | null | undefined) => void;
  /** Region presign+register upload; returns region fileId as conversation_attachment ref. */
  uploadAttachment: (
    file: File | Blob | Parameters<typeof uploadAttachmentViaRegion>[1],
    opts?: UploadAttachmentOpts,
  ) => Promise<UploadAttachmentResult>;
  registerTool: (descriptor: ChatToolDescriptor, handler: (args: unknown) => Promise<unknown> | unknown) => void;
  features: ChatFeatures;
  streamResolver: StreamEndpointResolver;
};

export type CreateNexusChatOptions = {
  client: CommandClient;
  transport?: ChatTransport;
  agentSource?: AgentSource;
  features?: Partial<ChatFeatures>;
  hooks?: ChatHooks;
  i18n?: Record<string, string>;
  logger?: { debug?: Function; error?: Function; warn?: Function };
  /**
   * Region/gateway origin used to absolutize relative `/public-files/...`
   * and `/ai-agents/ve/...` avatar URLs (portal and region are different origins in local/dev).
   */
  publicFilesBaseUrl?: string | null;
};

/**
 * Headless Nexus chat controller — framework-free.
 * Portal and OAuth embeds inject a CommandClient with the same send contract.
 */
export function createNexusChat(opts: CreateNexusChatOptions): NexusChat {
  const features: ChatFeatures = { ...DEFAULT_FEATURES, ...(opts.features || {}) };
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
    mergePanelPatch(panelId, {
      usage: usage as ChatTurn['usage'],
      credits: {
        ...(panel.credits || {}),
        usedCents: usedMinor,
        displayCurrency:
          usage.displayCurrency ?? panel.credits?.displayCurrency ?? null,
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
  const tools = new Map<string, { descriptor: ChatToolDescriptor; handler: (args: unknown) => unknown }>();
  let activeSocket: WebSocket | null = null;

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

  const log = (msg: string, extra?: Record<string, unknown>) => {
    opts.logger?.debug?.(msg, extra);
  };

  const closeSocket = () => {
    if (activeSocket) {
      try {
        activeSocket.close();
      } catch {
        /* ignore */
      }
      activeSocket = null;
    }
  };

  const finishPausedTurn = () => {
    store.setState({ streaming: false });
    patchCurrentPanel({ streaming: false });
    opts.hooks?.onStreamState?.('idle');
    closeSocket();
  };

  const streamInit = async (initOpts: {
    conversationId?: string;
    contactId?: string;
    roomId?: string;
  }) => {
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
    streamResolver.setFromStreamInit(payload || {});
    if (payload?.resourceId) {
      store.setState({ conversationId: String(payload.resourceId) });
      patchCurrentPanel({ conversationId: String(payload.resourceId) });
    }
  };

  const openContact = async (contactId: string, openOpts?: { title?: string }) => {
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
      throw new Error(result.message || 'conversations.create failed');
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
        throw new Error(renamed.message || 'conversations.update failed');
      }
    }
    const canonicalId = contact?.id || contactId;
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
    patchCurrentPanel({
      contactId: canonicalId,
      contactType: contact?.type || 'agent',
      conversationId: conversationId || store.getState().conversationId,
      roomId: null,
      roomPurpose: 'conversation',
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

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    features,
    streamResolver,
    getConversationSummary,
    registerTool(descriptor, handler) {
      tools.set(descriptor.name, { descriptor, handler });
    },
    async loadContacts() {
      if (!features.contacts) return;

      const [humanResult, veResult, vePublicResult] = await Promise.all([
        opts.client.send('anx.communicate.contacts.list', {}),
        opts.client.send('anx.ai-agents.virtual-employees.list', {}),
        opts.client.send('anx.ai-agents.virtual-employees.list-public', {}),
      ]);

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

      const contacts = Array.from(byId.values());
      store.setState({ contacts });
      void hydrateAgentAvatars(contacts, opts.client, publicFilesBaseUrl)
        .then((hydrated) => {
          if (hydrated !== contacts) store.setState({ contacts: hydrated });
        })
        .catch(() => {});
    },
    openContact,
    streamInit,
    async listRooms() {
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
          purpose: 'room',
        };
      });
      store.setState({ rooms });
      return rooms;
    },
    async createRoom(input) {
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
          if (!p?.id || (p.type !== 'agent' && p.type !== 'virtual_agent')) continue;
          try {
            await opts.client.send('anx.communicate.rooms.participants.add', {
              roomId,
              participant: {
                type: p.type,
                id: p.id,
                displayName: p.displayName,
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
      const detail: ChatRoomDetail = {
        id: String(data.roomId || data.id || data._id || roomId),
        title: String(data.title || data.name || data.label || 'Room'),
        type: typeof data.type === 'string' ? data.type : undefined,
        ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : null,
        viewerUserId: typeof data.viewerUserId === 'string' ? data.viewerUserId : null,
        viewerIsOwner: Boolean(data.viewerIsOwner),
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
    startBrowserCall: voice.startBrowserCall,
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
      }>,
      rehydrateOpts?: { conversationId?: string | null },
    ) {
      const turns: ChatTurn[] = rows.map((row, i) => ({
        id: String(row.id || `hist_${i}`),
        role: (row.role === 'user' || row.role === 'system' ? row.role : 'assistant') as ChatTurn['role'],
        text: String(row.content ?? row.text ?? ''),
        toolEvents: rehydrateToolRunsFromHistory(
          Array.isArray(row.toolCalls)
            ? (row.toolCalls as Array<Record<string, unknown>>)
            : null,
        ),
        ...(Array.isArray(row.attachments) && row.attachments.length
          ? { attachments: row.attachments }
          : {}),
      }));
      syncMessagesFromTurns(turns);
      const conversationId =
        typeof rehydrateOpts?.conversationId === 'string' && rehydrateOpts.conversationId.trim()
          ? rehydrateOpts.conversationId.trim()
          : null;
      if (conversationId) {
        store.setState({ conversationId });
        patchCurrentPanel({ conversationId, roomId: null, roomPurpose: 'conversation' });
      }
    },
    applyUsage(usage) {
      const panel = currentPanel(store.getState());
      if (!panel?.id || !usage) return;
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
    async sendMessage(
      text: string,
      sendOpts: {
        conversationId?: string;
        contactId?: string;
        roomId?: string;
        attachments?: IoDescriptor[];
        modelOverride?: ChatModelOverride;
        reasoningEffort?: 'low' | 'medium' | 'high';
        uiLocale?: string;
      } = {},
    ): Promise<SendMessageResult> {
      const id = `m_${Date.now()}`;
      const prevTurns = store.getState().turns;
      const userTurn: ChatTurn = {
        id,
        role: 'user',
        text,
        attachments: sendOpts.attachments,
        deliveryStatus: 'sending',
        deliveryError: null,
      };
      syncMessagesFromTurns([...prevTurns, userTurn]);
      store.setState({ streaming: true });
      patchCurrentPanel({ streaming: true, billingIssue: null });
      opts.hooks?.onStreamState?.('streaming');

      let conversationId = sendOpts.conversationId || store.getState().conversationId || undefined;
      const contactId = sendOpts.contactId || store.getState().selectedAgentId || undefined;
      const roomId = sendOpts.roomId;
      const panel = currentPanel(store.getState());
      const panelId = panel?.id;
      const tempFileIds = attachmentRefs(sendOpts.attachments);
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
          } catch (openErr) {
            emitSendOutcome(opts.hooks, 'client_preflight');
            store.setState({ streaming: false });
            patchCurrentPanel({ streaming: false });
            opts.hooks?.onStreamState?.('error');
            const message =
              openErr instanceof Error ? openErr.message : 'Could not open agent conversation';
            markUserDeliveryFailed(id, 'client_preflight', message);
            opts.hooks?.onError?.(openErr);
            return { ok: false, code: 'client_preflight', message };
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

        const assistantId = `a_${Date.now()}`;
        let turns: ChatTurn[] = [
          ...store.getState().turns,
          { id: assistantId, role: 'assistant', text: '', toolEvents: [], rawToolStream: [] },
        ];
        syncMessagesFromTurns(turns);
        patchCurrentPanel({
          streaming: true,
          conversationId: conversationId || store.getState().conversationId || null,
        });

        closeSocket();
        let wsConnected = false;
        let acceptStreamTokens = false;
        if (streamResolver.getOrderedEndpoints().length > 0) {
          wsConnected = await streamResolver
            .connectWebSocket({
              onMessage: (ev) => {
                const parsed = parseStreamMessage(ev.data);
                if (!parsed) return;
                // Drop Redis replay from the previous turn until this turn's
                // generationStart marker arrives (ConversationDispatch clears
                // replay after message.send, which is after WS connect).
                if (
                  parsed.type === 'conversation' &&
                  parsed.data &&
                  typeof parsed.data === 'object' &&
                  (parsed.data as { generationStart?: unknown }).generationStart === true
                ) {
                  acceptStreamTokens = true;
                } else if (
                  (parsed.type === 'token' || parsed.type === 'sub_agent_token') &&
                  !acceptStreamTokens
                ) {
                  return;
                }
                // Prefer store turns so deliveryStatus patches are not clobbered.
                turns = applyStreamEventToTurns(store.getState().turns, assistantId, parsed);
                syncMessagesFromTurns(turns);
                if (panelId && parsed.type === 'usage') {
                  const turnUsage = turns.find((t) => t.id === assistantId)?.usage || null;
                  applyUsageToPanel(panelId, turnUsage);
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
                }
                if (parsed.type === 'permission_elevation_request') {
                  const elev =
                    parsed.data && typeof parsed.data === 'object'
                      ? (parsed.data as {
                          elevationId?: string | null;
                          pack?: string | null;
                          command?: string | null;
                          commandNames?: string[];
                          callId?: string | null;
                          resourceRef?: Record<string, unknown> | null;
                          reason?: string | null;
                          requiredOnboardingType?: string | null;
                          onboardingSatisfied?: boolean;
                        })
                      : {};
                  opts.hooks?.onPermissionElevationRequired?.({
                    elevationId: elev.elevationId ?? null,
                    pack: elev.pack ?? null,
                    command: typeof elev.command === 'string' ? elev.command : null,
                    commandNames: elevationCommandNames(elev),
                    callId: typeof elev.callId === 'string' ? elev.callId : null,
                    resourceRef: elev.resourceRef ?? null,
                    reason: elev.reason ?? null,
                    requiredOnboardingType: elev.requiredOnboardingType ?? null,
                    onboardingSatisfied: elev.onboardingSatisfied,
                  });
                  finishPausedTurn();
                }
                if (parsed.type === 'paused') {
                  finishPausedTurn();
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
            .catch((err) => {
              log('ws_connect_failed', { message: String(err) });
              return false;
            });
        }

        const command = roomId
          ? 'anx.communicate.rooms.message.send'
          : opts.agentSource === 'raw_models'
            ? 'anx.inference.chat.completions'
            : 'anx.communicate.message.send';
        const result = (await opts.client.send(command, {
          text,
          message: command === 'anx.inference.chat.completions' ? text : undefined,
          conversationId: roomId ? undefined : store.getState().conversationId || conversationId,
          contactId: roomId || conversationId ? undefined : contactId,
          roomId,
          attachments: sendOpts.attachments,
          pageContext: tempFileIds.length ? { tempFileIds } : undefined,
          ...(sendOpts.modelOverride ? { modelOverride: sendOpts.modelOverride } : {}),
          ...(sendOpts.reasoningEffort ? { reasoningEffort: sendOpts.reasoningEffort } : {}),
          ...(sendOpts.uiLocale ? { uiLocale: sendOpts.uiLocale } : {}),
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
          const message = result.message || result.kind || 'Send failed';
          markUserDeliveryFailed(id, result.kind || 'command_error', message);
          return {
            ok: false,
            code: result.kind || 'command_error',
            message,
            kind: result.kind,
          };
        }

        const data = unwrapData(result);
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
        if (data?.conversationId) {
          store.setState({ conversationId: String(data.conversationId) });
          patchCurrentPanel({ conversationId: String(data.conversationId) });
        }

        patchTurnById(id, { deliveryStatus: 'sent', deliveryError: null });
        turns = store.getState().turns;

        if (!wsConnected) {
          const convId = store.getState().conversationId;
          let assistantText = '';
          let toolCalls: Array<Record<string, unknown>> | undefined;
          if (convId) {
            const listed = await opts.client.send('anx.communicate.conversations.messages.list', {
              conversationId: convId,
              limit: 20,
            });
            const listedData = unwrapData(listed);
            const msgs = (listedData.messages as Array<{
              role: string;
              content: string;
              toolCalls?: Array<Record<string, unknown>>;
            }>) || [];
            const assistant = [...msgs].reverse().find((m) => m.role === 'assistant');
            if (assistant?.content) assistantText = assistant.content;
            if (assistant?.toolCalls) toolCalls = assistant.toolCalls;
          }
          if (!assistantText && data) {
            assistantText =
              (typeof data.text === 'string' && data.text) ||
              (typeof data.content === 'string' && data.content) ||
              (typeof data.assistantText === 'string' && data.assistantText) ||
              '';
          }
          turns = store.getState().turns.map((t) =>
            t.id === assistantId
              ? {
                  ...t,
                  text: assistantText || translate('messageAccepted'),
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
      return {
        cancelled: Boolean((data as { cancelled?: boolean })?.cancelled),
        generationInProgress: Boolean((data as { generationInProgress?: boolean })?.generationInProgress),
      };
    },
  };
}

export function assertAiDisclosureAlwaysOn(state: ChatState): void {
  if (state.aiDisclosureVisible !== true) {
    throw new Error('AI disclosure must remain visible');
  }
  if ('hideAiDisclosure' in (state.features as object)) {
    throw new Error('hideAiDisclosure is not a valid feature flag');
  }
}
