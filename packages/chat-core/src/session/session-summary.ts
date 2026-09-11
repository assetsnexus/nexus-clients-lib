import type { PanelState } from '../state.js';

export type ConversationRole = 'parent' | 'subagent' | 'room' | string;

/**
 * Session fields expected from `anx.communicate.conversations.list`
 * (and applied onto panel / session-list rows). Defaults are safe when
 * the backend has not shipped the fields yet.
 */
export type ChatSessionSummary = {
  conversationId: string;
  title?: string | null;
  generationInProgress: boolean;
  isStreaming: boolean;
  unreadCount: number;
  activeSubAgentCount: number;
  backgroundSubAgentCompleted: boolean;
  conversationRole?: ConversationRole | null;
  parentConversationId?: string | null;
  subAgentRunId?: string | null;
  linkedConversationId?: string | null;
  /** Agent.contactStatus when known from list enrichment. */
  contactStatus?: 'available' | 'away' | 'disabled' | null;
};

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function mapConversationListItem(
  row: Record<string, unknown> | null | undefined,
): ChatSessionSummary | null {
  if (!row || typeof row !== 'object') return null;
  const conversationId = String(row.conversationId || row.id || row._id || '').trim();
  if (!conversationId) return null;
  const generationInProgress =
    truthy(row.generationInProgress) || truthy(row.isStreaming) || truthy(row.streaming);
  return {
    conversationId,
    title: typeof row.title === 'string' ? row.title : null,
    generationInProgress,
    isStreaming: generationInProgress,
    unreadCount: Number(row.unreadCount || 0) || 0,
    activeSubAgentCount:
      Number(
        row.activeSubAgentCount ??
          row.activeSubagentCount ??
          row.subagentCount ??
          0,
      ) || 0,
    backgroundSubAgentCompleted: truthy(row.backgroundSubAgentCompleted),
    conversationRole:
      typeof row.conversationRole === 'string'
        ? row.conversationRole
        : row.parentConversationId
          ? 'subagent'
          : null,
    parentConversationId:
      row.parentConversationId != null ? String(row.parentConversationId) : null,
    subAgentRunId:
      row.subAgentRunId != null
        ? String(row.subAgentRunId)
        : row.agentRunId != null
          ? String(row.agentRunId)
          : null,
    linkedConversationId:
      row.linkedConversationId != null ? String(row.linkedConversationId) : null,
    contactStatus:
      row.contactStatus === 'available' ||
      row.contactStatus === 'away' ||
      row.contactStatus === 'disabled' ||
      row.agentContactStatus === 'available' ||
      row.agentContactStatus === 'away' ||
      row.agentContactStatus === 'disabled'
        ? ((row.contactStatus || row.agentContactStatus) as
            | 'available'
            | 'away'
            | 'disabled')
        : null,
  };
}

/** Session-list row patch derived from conversations.list fields. */
export function sessionBadgeFieldsFromSummary(summary: ChatSessionSummary): {
  generationInProgress: boolean;
  isStreaming: boolean;
  unreadCount: number;
  activeSubAgentCount: number;
  backgroundSubAgentCompleted: boolean;
  conversationRole: ConversationRole | null;
  parentConversationId: string | null;
  subAgentRunId: string | null;
} {
  return {
    generationInProgress: summary.generationInProgress,
    isStreaming: summary.isStreaming,
    unreadCount: summary.unreadCount,
    activeSubAgentCount: summary.activeSubAgentCount,
    backgroundSubAgentCompleted: summary.backgroundSubAgentCompleted,
    conversationRole: summary.conversationRole || null,
    parentConversationId: summary.parentConversationId || null,
    subAgentRunId: summary.subAgentRunId || null,
  };
}

export function applySessionSummaryToPanel(
  panel: PanelState,
  summary: ChatSessionSummary,
): PanelState {
  return {
    ...panel,
    conversationId: summary.conversationId || panel.conversationId,
    streaming: summary.generationInProgress || summary.isStreaming || panel.streaming,
    generationInProgress: summary.generationInProgress || summary.isStreaming,
    unreadCount: summary.unreadCount,
    activeSubAgentCount: summary.activeSubAgentCount,
    backgroundSubAgentCompleted: summary.backgroundSubAgentCompleted,
    conversationRole: summary.conversationRole || null,
    parentConversationId: summary.parentConversationId || null,
    subAgentRunId: summary.subAgentRunId || null,
  };
}

/** Merge list-item fields onto an existing session row (portal host). */
export function mergeSessionRowWithListItem<T extends Record<string, unknown>>(
  row: T,
  listItem: Record<string, unknown>,
): T & ReturnType<typeof sessionBadgeFieldsFromSummary> {
  const summary = mapConversationListItem({ ...listItem, ...row });
  if (!summary) {
    return {
      ...row,
      generationInProgress: false,
      isStreaming: false,
      unreadCount: Number(row.unreadCount || 0) || 0,
      activeSubAgentCount: 0,
      backgroundSubAgentCompleted: false,
      conversationRole: null,
      parentConversationId: null,
      subAgentRunId: null,
    };
  }
  return { ...row, ...sessionBadgeFieldsFromSummary(summary) };
}
