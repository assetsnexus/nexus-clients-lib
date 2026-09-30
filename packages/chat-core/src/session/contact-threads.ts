import type { ChatContact } from '../types.js';
import { chatContactIdentityKeys } from '../contact-identity.js';

export type ContactThreadIndexEntry = {
  contactId: string;
  contactType?: string;
  displayName?: string;
  avatarUrl?: string | null;
  lastActivityAt?: string | null;
  unreadCount: number;
  latestConversationId?: string | null;
  latestStatus?: 'active' | 'archived' | string | null;
  hasMessages: boolean;
};

export type ConversationHistoryItem = {
  conversationId: string;
  title?: string | null;
  status?: string | null;
  lastActivityAt?: string | null;
  oneLineSummary?: string | null;
  unreadCount?: number;
};

export type ConversationRow = Record<string, unknown>;

function norm(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function conversationIdFromRow(row: ConversationRow | null | undefined): string {
  if (!row) return '';
  return norm(row.conversationId || row.id || row._id);
}

function contactIdFromRow(row: ConversationRow): string {
  return norm(
    row.virtualEmployeeId ||
      row.anxVeId ||
      row.virtualAgentId ||
      row.agentId ||
      row.peerUserId ||
      row.contactId,
  );
}

const ROW_CONTACT_FIELDS = [
  'virtualEmployeeId',
  'anxVeId',
  'virtualAgentId',
  'agentId',
  'peerUserId',
  'contactId',
] as const;

function rowHasMessages(row: ConversationRow): boolean {
  if (row.hasMessages === true) return true;
  const count = Number(row.messageCount);
  if (Number.isFinite(count) && count > 0) return true;
  if (row.lastMessageAt != null && norm(row.lastMessageAt)) return true;
  if (typeof row.oneLineSummary === 'string' && row.oneLineSummary.trim()) return true;
  return false;
}

function parseActivityAt(row: ConversationRow): string | null {
  const v = row.lastActivityAt ?? row.lastMessageAt ?? row.updatedAt ?? row.createdAt;
  return v != null && norm(v) ? String(v) : null;
}

function compareActivityDesc(a: ConversationRow, b: ConversationRow): number {
  const ta = parseActivityAt(a);
  const tb = parseActivityAt(b);
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return tb.localeCompare(ta);
}

/** Match a conversation row to a contact id (virtualEmployeeId, agentId, peerUserId, contactId, aliases). */
export function conversationBelongsToContact(
  row: ConversationRow,
  contactId: string,
  contact?: Partial<ChatContact> | null,
): boolean {
  const id = norm(contactId);
  if (!id || !row) return false;

  const keys = contact ? chatContactIdentityKeys(contact) : new Set<string>();
  if (!contact) keys.add(id);
  else keys.add(id);

  const primary = contactIdFromRow(row);
  if (primary && keys.has(primary)) return true;

  for (const field of ROW_CONTACT_FIELDS) {
    const v = norm(row[field]);
    if (v && keys.has(v)) return true;
  }

  if (!contact) {
    if (primary === id) return true;
    for (const field of ROW_CONTACT_FIELDS) {
      if (norm(row[field]) === id) return true;
    }
  }

  return false;
}

/** Pick latest active conversation for a contact from list rows. */
export function pickLatestOpenConversation(
  conversations: ConversationRow[],
  contactId: string,
  contact?: Partial<ChatContact> | null,
): ConversationRow | null {
  const matching = (conversations || []).filter((row) => {
    if (!conversationBelongsToContact(row, contactId, contact)) return false;
    const status = norm(row.status).toLowerCase();
    if (status && status !== 'active') return false;
    return Boolean(conversationIdFromRow(row));
  });
  matching.sort(compareActivityDesc);
  return matching[0] || null;
}

/** List history for a contact, newest first (active + archived). */
export function historyForContact(
  conversations: ConversationRow[],
  contactId: string,
  contact?: Partial<ChatContact> | null,
): ConversationHistoryItem[] {
  const matching = (conversations || []).filter(
    (row) => conversationBelongsToContact(row, contactId, contact) && conversationIdFromRow(row),
  );
  matching.sort(compareActivityDesc);
  return matching.map((row) => ({
    conversationId: conversationIdFromRow(row),
    title: typeof row.title === 'string' ? row.title : null,
    status: row.status != null ? String(row.status) : null,
    lastActivityAt: parseActivityAt(row),
    oneLineSummary: typeof row.oneLineSummary === 'string' ? row.oneLineSummary : null,
    unreadCount: Number(row.unreadCount || 0) || undefined,
  }));
}

/** Build contact index from contacts + conversation list rows. Sort: latest message first, then contacts with no messages. */
export function buildContactThreadIndex(
  contacts: Array<Partial<ChatContact> & { id?: string }>,
  conversations: ConversationRow[],
): ContactThreadIndexEntry[] {
  const entries: ContactThreadIndexEntry[] = [];

  for (const contact of contacts || []) {
    const contactId = norm(contact.id);
    if (!contactId) continue;

    const rows = (conversations || []).filter((row) =>
      conversationBelongsToContact(row, contactId, contact),
    );

    let unreadCount = 0;
    let hasMessages = false;
    for (const row of rows) {
      unreadCount += Number(row.unreadCount || 0) || 0;
      if (rowHasMessages(row)) hasMessages = true;
    }

    const sorted = [...rows].sort(compareActivityDesc);
    const latest = sorted[0];
    const lastActivityAt = latest ? parseActivityAt(latest) : null;
    if (lastActivityAt) hasMessages = true;

    entries.push({
      contactId,
      contactType: contact.type,
      displayName: contact.name,
      avatarUrl: contact.avatarUrl ?? null,
      lastActivityAt,
      unreadCount,
      latestConversationId: latest ? conversationIdFromRow(latest) : null,
      latestStatus: latest?.status != null ? String(latest.status) : null,
      hasMessages,
    });
  }

  entries.sort((a, b) => {
    if (a.hasMessages && !b.hasMessages) return -1;
    if (!a.hasMessages && b.hasMessages) return 1;
    if (a.hasMessages && b.hasMessages) {
      return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '');
    }
    return (a.displayName || a.contactId).localeCompare(b.displayName || b.contactId);
  });

  return entries;
}
