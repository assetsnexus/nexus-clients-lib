import type {
  ChatCreditsState,
  ChatBillingIssueState,
  ChatRoomPresence,
  ChatSpendLimitsState,
  ChatThrottleState,
  ChatUsageSnapshot,
  ChatVoiceCallSession,
  IoDescriptor,
} from './types.js';

export type ChatToolRunStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'needs_approval'
  | 'approved'
  | 'reverted'
  | 'paused'
  /**
   * P8-8: the region tool bridge refused the call because the conversation's
   * execution mode (ask|plan) does not allow the mutation class the command
   * needs. Must render as a distinct refusal chip, never as "done" (success).
   */
  | 'mode_blocked';

/** WP23: sub-agent completion status chip values. */
export type SubAgentFinalStatus =
  | 'completed'
  | 'error'
  | 'timeout'
  | 'cancelled'
  | 'interrupted'
  | 'paused';

export type ChatToolRun = {
  id: string;
  tool: string;
  label: string;
  status: ChatToolRunStatus;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string | null;
  round?: number;
  approvalRequired?: boolean;
  approvalId?: string | null;
  parentCallId?: string | null;
  kind?: 'tool' | 'sub_agent' | 'compaction' | 'mention';
  /** WP23: accumulated sub-agent streamed text (not appended to parent bubble). */
  subAgentText?: string;
  /** WP23: sub-agent token count from progress events. */
  subAgentTokensUsed?: number;
  /** WP23: sub-agent current tool from last progress event. */
  subAgentCurrentTool?: string;
  /** WP23: structured summary from sub_agent_done. */
  subAgentSummary?: unknown;
  /** WP23: sub-agent final status. */
  subAgentFinalStatus?: SubAgentFinalStatus;
  /** AgentRun id when origin=chat_agent (stable across refresh). */
  subAgentRunId?: string | null;
  /** Linked child conversation for open-in-chat. */
  linkedConversationId?: string | null;
  /** Epoch ms when the sub-agent started (for elapsed UI). */
  startedAtMs?: number | null;
  /** queue | interrupt | steer preferred for follow-up messages. */
  deliveryMode?: 'queue' | 'interrupt' | 'steer' | string | null;
  plan?: import('./agent-runs/types.js').AgentRunPlan | null;
  tasks?: import('./agent-runs/types.js').AgentRunTask[];
  costLimitMinor?: number | null;
  /** Live sub-agent phase from progress / run status (`awaiting_approval` = paused on the user). */
  subAgentPhase?: 'running' | 'awaiting_approval' | 'paused' | null;
  /** Approval the sub-agent waits on (safe metadata only; drives the in-chat prompt). */
  subAgentPendingApproval?: SubAgentPendingApproval | null;
};

export type SubAgentPendingApproval = {
  approvalKind: 'permission_elevation' | 'sca' | 'data_access' | string;
  elevationId?: string | null;
  pack?: string | null;
  command?: string | null;
  reason?: string | null;
  resourceRef?: Record<string, unknown> | null;
  authRequestId?: string | null;
  requiredOnboardingType?: string | null;
  onboardingSatisfied?: boolean;
};

export type ChatDeliveryStatus = 'sending' | 'sent' | 'failed';

export type ChatTurn = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  attachments?: IoDescriptor[];
  media?: Array<{
    kind: 'image' | 'audio';
    url?: string | null;
    mimeType?: string | null;
    title?: string | null;
    workloadId?: string | null;
  }>;
  /** Merged tool runs (callId upsert). Prefer over raw stream appends. */
  toolEvents?: ChatToolRun[];
  /** Raw stream events kept for re-merge / debug. */
  rawToolStream?: Array<{ type: string; data?: unknown }>;
  audioUrl?: string | null;
  audioStatus?: 'loading' | 'ready' | 'failed';
  compaction?: { beforeTokens?: number; afterTokens?: number; summary?: string } | null;
  mentions?: Array<{ id: string; label: string; start?: number; end?: number }>;
  usage?: ChatUsageSnapshot | null;
  /** Outbound user-message delivery (messenger-style). */
  deliveryStatus?: ChatDeliveryStatus;
  deliveryError?: { code?: string; message: string; details?: string } | null;
  /** ISO timestamp or epoch-ms string when the turn was created. */
  createdAt?: string | null;
  /** Actor id (user / agent) that authored the turn. */
  senderId?: string | null;
  /** Display name when known (rooms / multi-party). */
  senderName?: string | null;
};

export type PanelState = {
  id: string;
  contactId: string;
  contactType: 'agent' | 'user' | 'group';
  conversationId: string | null;
  roomId?: string | null;
  roomPurpose?: 'conversation' | 'room';
  turns: ChatTurn[];
  streaming: boolean;
  /** Alias of streaming from conversations.list generationInProgress. */
  generationInProgress?: boolean;
  queuedMessages: string[];
  unreadCount: number;
  /** Active chat_agent AgentRuns for this conversation. */
  activeSubAgentCount?: number;
  /** True when a background subagent finished while the panel was closed. */
  backgroundSubAgentCompleted?: boolean;
  conversationRole?: 'parent' | 'subagent' | 'room' | string | null;
  parentConversationId?: string | null;
  subAgentRunId?: string | null;
  usage?: ChatTurn['usage'];
  spendLimits?: ChatSpendLimitsState | null;
  throttle?: ChatThrottleState | null;
  credits?: ChatCreditsState | null;
  billingIssue?: ChatBillingIssueState | null;
  presence?: ChatRoomPresence[];
  activeCall?: ChatVoiceCallSession | null;
  pausedCallId?: string | null;
};
