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
  | 'paused';

/** WP23: sub-agent completion status chip values. */
export type SubAgentFinalStatus =
  | 'completed'
  | 'error'
  | 'timeout'
  | 'cancelled'
  | 'interrupted';

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
  queuedMessages: string[];
  unreadCount: number;
  usage?: ChatTurn['usage'];
  spendLimits?: ChatSpendLimitsState | null;
  throttle?: ChatThrottleState | null;
  credits?: ChatCreditsState | null;
  billingIssue?: ChatBillingIssueState | null;
  presence?: ChatRoomPresence[];
  activeCall?: ChatVoiceCallSession | null;
  pausedCallId?: string | null;
};
