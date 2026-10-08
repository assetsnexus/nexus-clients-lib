import type { ChatContact, IoDescriptor } from '../types.js';
import { conversationBelongsToContact, type ConversationRow } from './contact-threads.js';

/**
 * Single-agent lock. Partners use this when a chat may talk to one
 * virtual employee and must not browse the rest of the directory.
 */
export type LockedAgent = {
  virtualEmployeeId: string;
};

/**
 * `anx.communicate.conversations.list` returns `virtualEmployeeId` on each row.
 * The request schema accepts `limit`, `status`, `partnerKind`,
 * `excludeAppAgentsOfClientId`, and `groupBy`. `virtualEmployeeId` is not a
 * filter — unknown keys are stripped — so locked lists filter the response.
 * When a list payload starts accepting the id, pass it from here.
 */
export const CONVERSATIONS_LIST_ACCEPTS_VIRTUAL_EMPLOYEE_ID = false;

const MAX_VIRTUAL_EMPLOYEE_ID = 200;

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
  return { virtualEmployeeId };
}

export function lockedAgentContact(locked: LockedAgent): ChatContact {
  return {
    id: locked.virtualEmployeeId,
    name: locked.virtualEmployeeId,
    type: 'agent',
    virtualEmployeeId: locked.virtualEmployeeId,
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
      id: typeof row.id === 'string' ? row.id : undefined,
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
