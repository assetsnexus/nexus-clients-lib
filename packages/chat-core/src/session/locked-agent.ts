import type { ChatContact, IoDescriptor } from '../types.js';
import { conversationBelongsToContact, type ConversationRow } from './contact-threads.js';

/**
 * Single-agent lock. Partners use this when a chat may talk to one
 * virtual employee and must not browse the rest of the directory.
 */
export type LockedAgent = {
  virtualEmployeeId: string;
  /**
   * Host label. When set, it overwrites the server agent name.
   * Omitted when it is empty or the same as `virtualEmployeeId`.
   */
  displayName?: string;
  /**
   * Host avatar. When set, it overwrites the server picture.
   * Omitted when empty so the UI does not render a broken image.
   */
  avatarUrl?: string;
};

/**
 * `anx.communicate.conversations.list` accepts `virtualEmployeeId`. Inference
 * limits the page to that employee and keeps the employee when an app
 * identity would otherwise hide its own agents. The client still drops any
 * other agent's rows.
 */
export const CONVERSATIONS_LIST_ACCEPTS_VIRTUAL_EMPLOYEE_ID = true;

const MAX_VIRTUAL_EMPLOYEE_ID = 200;
const MAX_DISPLAY_NAME = 80;

function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

/** A label safe to show. The raw virtual-employee id is not a name. */
export function humanAgentLabel(value: unknown, virtualEmployeeId?: string | null): string | null {
  const label = cleanLabel(value);
  const id = cleanLabel(virtualEmployeeId);
  if (!label || (id && label === id)) return null;
  return label;
}

/** A picture URL safe to put on an img. Blank and script URLs are dropped. */
export function usableAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.length > 2048) return null;
  if (/^(javascript|vbscript):/i.test(url)) return null;
  return url;
}

/**
 * Header picture. The host override wins. Otherwise the server picture.
 * An empty value is null so the UI does not render a broken image.
 */
export function resolveDisplayAvatar(
  hostAvatarUrl?: string | null,
  serverAvatarUrl?: string | null,
): string | null {
  return usableAvatarUrl(hostAvatarUrl) || usableAvatarUrl(serverAvatarUrl);
}

/**
 * Header text for a locked embed. A host `displayName` overwrites the server
 * agent name. Never returns the raw virtual-employee id.
 */
export function lockedAgentVisibleName(
  locked: Pick<LockedAgent, 'virtualEmployeeId' | 'displayName'> | null | undefined,
  resolvedName?: string | null,
): string {
  const id = cleanLabel(locked?.virtualEmployeeId);
  return humanAgentLabel(locked?.displayName, id) || humanAgentLabel(resolvedName, id) || (locked ? 'Agent' : 'Nexus Chat');
}

/** Empty-thread copy. A selected or locked agent is not a contact picker. */
export function threadEmptyLabel(input: {
  lockedAgent?: Pick<LockedAgent, 'virtualEmployeeId'> | null;
  contactSelected: boolean;
}): string {
  if (cleanLabel(input.lockedAgent?.virtualEmployeeId) || input.contactSelected) {
    return 'Send a message to start.';
  }
  return 'Select a contact to start chatting.';
}

export function parseLockedAgent(input: LockedAgent | null | undefined): LockedAgent | null {
  if (input == null) return null;
  if (typeof input !== 'object') {
    throw new Error('lockedAgent must be { virtualEmployeeId: string }');
  }
  const raw = input.virtualEmployeeId;
  if (typeof raw !== 'string') {
    throw new Error('lockedAgent.virtualEmployeeId is required');
  }
  const virtualEmployeeId = raw.trim();
  if (!virtualEmployeeId) {
    throw new Error('lockedAgent.virtualEmployeeId is required');
  }
  if (virtualEmployeeId.length > MAX_VIRTUAL_EMPLOYEE_ID) {
    throw new Error('lockedAgent.virtualEmployeeId is too long');
  }
  const displayName = cleanLabel(input.displayName);
  if (displayName.length > MAX_DISPLAY_NAME) {
    throw new Error('lockedAgent.displayName is too long');
  }
  const avatarUrl = usableAvatarUrl(input.avatarUrl);
  const visible = humanAgentLabel(displayName, virtualEmployeeId);
  return {
    virtualEmployeeId,
    ...(visible ? { displayName: visible } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export function lockedAgentContact(locked: LockedAgent): ChatContact {
  return {
    id: locked.virtualEmployeeId,
    name: lockedAgentVisibleName(locked),
    type: 'agent',
    virtualEmployeeId: locked.virtualEmployeeId,
    ...(locked.avatarUrl ? { avatarUrl: locked.avatarUrl } : {}),
  };
}

export function lockedAgentAllowsContact(
  locked: LockedAgent | null,
  contact: { id?: string | null; virtualEmployeeId?: string | null; agentId?: string | null },
): boolean {
  if (!locked) return true;
  const id = locked.virtualEmployeeId;
  return contact.id === id || contact.virtualEmployeeId === id || contact.agentId === id;
}

/** Add the server filter only when conversations.list accepts it. */
export function withLockedAgentListFilter(
  payload: Record<string, unknown>,
  locked: LockedAgent | null,
): Record<string, unknown> {
  if (!locked || !CONVERSATIONS_LIST_ACCEPTS_VIRTUAL_EMPLOYEE_ID) return payload;
  return { ...payload, virtualEmployeeId: locked.virtualEmployeeId };
}

/** Drop every conversation that is not with the locked agent. */
export function filterConversationsForLockedAgent(
  rows: ConversationRow[],
  locked: LockedAgent | null,
): ConversationRow[] {
  if (!locked) return rows || [];
  const contact = lockedAgentContact(locked);
  return (rows || []).filter((row) =>
    conversationBelongsToContact(row, locked.virtualEmployeeId, contact),
  );
}

/** Where the shared conversation list is drawn. Omitted follows the lock. */
export type ConversationListMode = 'sidebar' | 'hidden' | 'drawer';

/**
 * A locked chat hides the list. An explicit mode wins, so a host can show
 * the full list, keep it hidden, or open a filtered drawer.
 */
export function resolveConversationListMode(input: {
  conversationList?: ConversationListMode | null;
  lockedAgent?: Pick<LockedAgent, 'virtualEmployeeId'> | null;
}): ConversationListMode {
  const requested = input.conversationList;
  if (requested === 'sidebar' || requested === 'hidden' || requested === 'drawer') return requested;
  return cleanLabel(input.lockedAgent?.virtualEmployeeId) ? 'hidden' : 'sidebar';
}

/** Optional id used only to mark rows. Empty or oversized values mark nothing. */
export function parseHighlightAgentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > MAX_VIRTUAL_EMPLOYEE_ID) return null;
  return id;
}

/** True when a list row is the agent a host asked to mark. Other rows stay visible. */
export function conversationHighlightsAgent(
  row: {
    virtualEmployeeId?: string | null;
    agentId?: string | null;
    contactId?: string | null;
    id?: string | null;
  },
  highlightAgentId: string | null | undefined,
): boolean {
  const id = parseHighlightAgentId(highlightAgentId);
  if (!id) return false;
  const keys = [row.virtualEmployeeId, row.agentId, row.contactId, row.id]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  return keys.includes(id);
}

export type RehydrateMessageRow = {
  id?: string;
  role: string;
  content?: string;
  text?: string;
  toolCalls?: Array<Record<string, unknown>>;
  attachments?: IoDescriptor[];
  createdAt?: string | null;
  senderId?: string | null;
  senderName?: string | null;
};

export function rehydrateRowsFromMessages(messages: unknown[]): RehydrateMessageRow[] {
  return (messages || []).map((message) => {
    const row =
      message && typeof message === 'object' ? (message as Record<string, unknown>) : {};
    return {
      id:
        typeof row.id === 'string'
          ? row.id
          : typeof row.messageId === 'string'
            ? row.messageId
            : undefined,
      role: String(row.role || 'assistant'),
      content: String(row.content ?? row.text ?? ''),
      toolCalls: Array.isArray(row.toolCalls)
        ? (row.toolCalls as Array<Record<string, unknown>>)
        : undefined,
      attachments: Array.isArray(row.attachments) ? (row.attachments as IoDescriptor[]) : undefined,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
      senderId: typeof row.senderId === 'string' ? row.senderId : null,
      senderName: typeof row.senderName === 'string' ? row.senderName : null,
    };
  });
}
