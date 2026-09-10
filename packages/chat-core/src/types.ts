export type ChatTransport = 'direct' | 'bff';
export type AgentSource = 'nexus' | 'app' | 'raw_models' | 'both';

export type ChatFeatures = {
  contacts: boolean;
  groups: boolean;
  aiGroups: boolean;
  userDatabases: boolean;
  modelPicker: boolean;
  modelPricing: boolean;
  publicEdgeBadges: boolean;
  agentContextDetails: boolean;
  agentApprovals: boolean;
  encryptionModes: boolean;
  spendLimits: boolean;
  calls: boolean;
};

/** Intentionally NOT part of ChatFeatures — AI disclosure cannot be disabled. */
export const AI_DISCLOSURE_REQUIRED = true as const;

export const DEFAULT_FEATURES: ChatFeatures = {
  contacts: true,
  groups: true,
  aiGroups: true,
  userDatabases: true,
  modelPicker: true,
  modelPricing: true,
  publicEdgeBadges: true,
  agentContextDetails: true,
  agentApprovals: true,
  encryptionModes: true,
  spendLimits: true,
  calls: true,
};

export type ChatToolDescriptor = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type IoDescriptor =
  | {
      kind: 'inline';
      mimeType: string;
      dataBase64: string;
      byteLength: number;
      filename?: string;
    }
  | {
      kind: 'bucket';
      bucketId: string;
      path: string;
      mimeType?: string;
      filename?: string;
    }
  | {
      kind: 'entity';
      entityType: 'conversation_attachment' | 'knowledge_artifact' | string;
      ref: string;
      mimeType?: string;
      filename?: string;
    };

export type ChatUsageSnapshot = {
  tokensUsed?: number;
  maxContextTokens?: number;
  costCents?: number;
  creditsCents?: number;
  /** Money minor units for UI when not prepaid platform credits. */
  displayCostMinor?: number;
  /** ISO 4217 currency for displayCostMinor / money formatting. */
  displayCurrency?: string;
  contextSnapshot?: unknown;
};

export type ChatSpendLimitsState = {
  dailyCents?: number | null;
  weeklyCents?: number | null;
  monthlyCents?: number | null;
  reached?: boolean;
  scope?: string | null;
};

export type ChatThrottleState = {
  retryAfterMs?: number;
  remainingMs?: number;
  lockedUntil?: string | null;
  reason?: string | null;
};

export type ChatCreditsState = {
  availableCents?: number | null;
  usedCents?: number | null;
  billingMode?: 'credits' | 'free' | 'admin_waived' | string | null;
  /** When set, usedCents/availableCents are money minor units in this currency. */
  displayCurrency?: string | null;
};

/** Stable billing / quota issue shown by portal BillingIssueWidget. */
export type ChatBillingIssueCode =
  | 'INSUFFICIENT_CREDITS'
  | 'SUBSCRIPTION_INACTIVE'
  | 'SPENDING_LIMIT'
  | 'AGENT_USAGE_LIMIT'
  | 'CREDIT_DISPATCH_SUSPENDED';

export type ChatBillingIssueState = {
  code: ChatBillingIssueCode;
  message?: string | null;
  at?: string | null;
};

export type ChatRoomSummary = {
  id: string;
  title: string;
  /** Custom room name when set; empty/unnamed rooms leave this null. */
  name?: string | null;
  type?: 'dm' | 'group' | string;
  participantCount?: number;
  participantNames?: string[];
  unreadCount?: number;
  purpose?: 'conversation' | 'room';
};

/** Per-turn model selection for anx.communicate.message.send. */
export type ChatModelOverride = {
  /** Catalog id or `static:<registryKey>` (resolved via ensureDbModelId). */
  modelId: string;
  externalModelId?: string;
  preferredHostingType?:
    | 'public_cloud'
    | 'managed_cloud'
    | 'private_cloud'
    | 'edge_processing';
};

export type ChatRoomLeaveAction = 'leave' | 'archive' | 'transfer_and_leave';

export type ChatRoomParticipantAiConfig = {
  modelId?: string | null;
  responseMode?: 'mention_only' | 'always' | null;
  compactBeforeReply?: boolean;
};

export type ChatRoomParticipant = {
  type: 'user' | 'agent' | 'virtual_agent' | string;
  id: string;
  role?: string | null;
  displayName?: string | null;
  username?: string | null;
  /** Per-agent orchestration overrides from `orchestration.aiParticipants`. */
  aiConfig?: ChatRoomParticipantAiConfig | null;
};

export type ChatRoomOrchestration = {
  defaultAiResponseMode?: 'mention_only' | 'always' | string | null;
  maxAgentTurnsLimit?: number | null;
  maxAiOnlyChainLength?: number | null;
  maxAutoBurstCreditsCents?: number | null;
  autoChatStyle?: 'efficient' | 'story' | 'mixed' | string | null;
  roomRules?: string[] | null;
  mentionInfoBubbleDismissed?: boolean | null;
  aiParticipants?: Array<{
    participantType?: string;
    participantId?: string;
    type?: string;
    id?: string;
    modelId?: string | null;
    responseMode?: 'mention_only' | 'always' | null;
    compactBeforeReply?: boolean;
  }> | null;
};

export type ChatRoomDetail = {
  id: string;
  title: string;
  type?: string;
  ownerUserId?: string | null;
  viewerUserId?: string | null;
  viewerIsOwner?: boolean;
  participants: ChatRoomParticipant[];
  encryptionMode?: string | null;
  /** Disappearing-message TTL (seconds); null = retain indefinitely. */
  messageTtlSeconds?: number | null;
  orchestration?: ChatRoomOrchestration | null;
};

export type ChatRoomPresence = {
  roomId: string;
  participantId: string;
  status: 'online' | 'offline' | 'typing' | 'unknown';
  updatedAt?: string;
};

export type ChatVoiceCallStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'paused'
  | 'active'
  | 'waiting_inbound'
  | 'ringing'
  | 'ended'
  | 'error';

export type ChatVoiceDialInInfo = {
  phoneE164?: string | null;
  phoneDisplay?: string | null;
  accessCode?: string | null;
  channelId?: string | null;
  resolvedPricing?: Record<string, unknown> | null;
};

export type ChatVoiceCallSession = {
  agentId: string;
  callSid: string;
  conversationId?: string | null;
  mode?: 'browser' | 'inbound' | 'outbound';
  status?: ChatVoiceCallStatus;
  muted?: boolean;
  paused?: boolean;
  elapsedSec?: number;
  errorMessage?: string | null;
  answerSdp?: string | null;
  realtime?: Record<string, unknown> | null;
  dialIn?: ChatVoiceDialInInfo | null;
  toMasked?: string | null;
};

export type ChatSendOutcomeCode =
  | 'ok'
  | 'client_preflight'
  | 'command_error'
  | 'stream_init'
  | 'exception';

export type ChatHooks = {
  onScaRequired?: (info: { authRequestId: string | null; command: string }) => void;
  onDataAccessApproval?: (info: unknown) => void;
  onPermissionElevationRequired?: (info: {
    elevationId?: string | null;
    pack?: string | null;
    command?: string | null;
    commandNames?: string[];
    callId?: string | null;
    resourceRef?: Record<string, unknown> | null;
    reason?: string | null;
    requiredOnboardingType?: string | null;
    onboardingSatisfied?: boolean;
  }) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onToolApprovalRequired?: (run: {
    callId: string;
    tool: string;
    approvalId?: string | null;
  }) => void;
  onStreamState?: (state: string) => void;
  onUsage?: (usage: ChatUsageSnapshot) => void;
  /** Fired once per `sendMessage` attempt with the terminal outcome code. */
  onSendOutcome?: (code: ChatSendOutcomeCode) => void;
  onError?: (err: unknown) => void;
  /** Region billing signal — host should end or block when credits hit zero. */
  onCreditsExhausted?: (info: { callSid: string | null; agentId: string | null }) => void;
  onVoiceSurfaceChange?: (surface: {
    status: string;
    elapsedSec: number;
    muted: boolean;
    paused: boolean;
    errorMessage: string | null;
    agentId: string | null;
    callSid: string | null;
    mode: 'browser' | 'inbound' | 'outbound' | null;
  }) => void;
};

export type ChatContact = {
  id: string;
  name: string;
  type: 'agent' | 'user' | 'group';
  unreadCount?: number;
  /** Sidecar Agent Mongo id when type=agent (after create/open). */
  agentId?: string | null;
  /** Region VE id when type=agent. */
  virtualEmployeeId?: string | null;
  /** Avatar image URL when available (http(s)/relative; never inline data from list). */
  avatarUrl?: string | null;
  /**
   * List media ref for post-load avatar hydrate via
   * `anx.ai-agents.virtual-employees.media.get`.
   */
  avatarRef?: {
    kind: string;
    value?: string;
    fileId?: string;
    slot?: string;
  } | null;
  /** Alternate ids (Mongo `_id`, legacy keys) that resolve to this contact. */
  aliases?: string[];
  /**
   * True when this agent came from the caller's owned VE list
   * (`anx.ai-agents.virtual-employees.list`), so the portal may deep-link to config.
   */
  canConfigure?: boolean;
  /** VE responsible owner (billing / admin contact). */
  responsibleUserId?: string | null;
  /** Org that owns the VE when scoped to an organization. */
  orgId?: string | null;
};
