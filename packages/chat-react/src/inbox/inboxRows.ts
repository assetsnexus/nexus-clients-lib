export type InboxKind = 'human' | 'agent' | 'group' | 'room';
export type KindFilter = 'all' | 'humans' | 'agents' | 'groups' | 'pinned';

export type InboxRow = {
  id: string;
  identityKey: string;
  identityLabel: string;
  identityLogo: string | null;
  conversationId: string;
  contactId: string | null;
  /** Region virtual employee id when the list row included one. */
  virtualEmployeeId: string | null;
  agentId: string | null;
  title: string;
  summary: string;
  avatarUrl: string | null;
  kind: InboxKind;
  unreadCount: number;
  updatedAt: number;
  pinned: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function unwrapList(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const rec = asRecord(payload);
  if (!rec) return [];
  for (const key of keys) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  const data = asRecord(rec.data) || asRecord(rec.responseObject);
  if (!data) return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

export function classifyKind(raw: Record<string, unknown>): InboxKind {
  const blob = `${raw.kind || ''} ${raw.type || ''} ${raw.participantKind || ''} ${raw.roomKind || ''}`.toLowerCase();
  if (blob.includes('room') || blob.includes('group')) return blob.includes('room') && !blob.includes('group') ? 'room' : 'group';
  if (blob.includes('agent') || raw.agentId || raw.virtualEmployeeId) return 'agent';
  return 'human';
}

export function matchesKindFilter(row: InboxRow, filter: KindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pinned') return row.pinned;
  if (filter === 'humans') return row.kind === 'human';
  if (filter === 'agents') return row.kind === 'agent';
  if (filter === 'groups') return row.kind === 'group' || row.kind === 'room';
  return true;
}

function textOf(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function timeOf(raw: Record<string, unknown>): number {
  const value = raw.updatedAt || raw.lastMessageAt || raw.createdAt;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function conversationToRow(
  raw: Record<string, unknown>,
  identity: { key: string; label: string; logo: string | null },
): InboxRow | null {
  const conversationId = textOf(raw, ['conversationId', 'id', '_id']);
  if (!conversationId) return null;
  const kind = classifyKind(raw);
  const title =
    textOf(raw, ['title', 'name', 'displayName', 'contactName']) ||
    (kind === 'agent' ? 'Agent' : kind === 'group' || kind === 'room' ? 'Group' : 'Conversation');
  return {
    id: `${identity.key}|${conversationId}`,
    identityKey: identity.key,
    identityLabel: identity.label,
    identityLogo: identity.logo,
    conversationId,
    contactId: textOf(raw, ['contactId', 'agentId', 'peerId']) || null,
    virtualEmployeeId: textOf(raw, ['virtualEmployeeId', 'anxVeId']) || null,
    agentId: textOf(raw, ['agentId']) || null,
    title,
    summary: textOf(raw, ['summary', 'lastMessage', 'preview', 'lastText']),
    avatarUrl: inboxAvatarFromRow(raw),
    kind,
    unreadCount: Number(raw.unreadCount || raw.unread || 0) || 0,
    updatedAt: timeOf(raw),
    pinned: Boolean(raw.pinned),
  };
}

/** Keep inbox rows that belong to the locked virtual employee. */
export function filterInboxRowsForLockedAgent(rows: InboxRow[], virtualEmployeeId: string): InboxRow[] {
  const id = virtualEmployeeId.trim();
  if (!id) return [];
  return rows.filter((row) => {
    const keys = [row.virtualEmployeeId, row.agentId, row.contactId]
      .map((value) => (value || '').trim())
      .filter(Boolean);
    return keys.includes(id);
  });
}

function nestedRecord(raw: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = raw[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Picture fields the portal session list reads, including a nested agent. */
export function inboxAvatarFromRow(raw: Record<string, unknown>): string | null {
  const direct = textOf(raw, ['avatarUrl', 'photoUrl', 'imageUrl', 'profilePicture']);
  if (direct) return direct;
  const nested = nestedRecord(raw, 'agent') || nestedRecord(raw, 'virtualEmployee') || nestedRecord(raw, 'contact');
  return nested ? textOf(nested, ['avatarUrl', 'profilePicture', 'photoUrl', 'imageUrl']) || null : null;
}

/**
 * Portal session rows use the contact picture, then the row picture.
 * An empty string stays null so the list does not render a broken image.
 */
export function mergeInboxAgentAvatars(
  rows: InboxRow[],
  contacts: Array<{
    id?: string | null;
    virtualEmployeeId?: string | null;
    agentId?: string | null;
    avatarUrl?: string | null;
  }>,
): InboxRow[] {
  return rows.map((row) => {
    const contact = contacts.find((item) => {
      const keys = [item.id, item.virtualEmployeeId, item.agentId].map((value) => (value || '').trim()).filter(Boolean);
      const rowKeys = [row.contactId, row.virtualEmployeeId, row.agentId].map((value) => (value || '').trim()).filter(Boolean);
      return rowKeys.some((key) => keys.includes(key));
    });
    const fromContact = typeof contact?.avatarUrl === 'string' ? contact.avatarUrl.trim() : '';
    const fromRow = typeof row.avatarUrl === 'string' ? row.avatarUrl.trim() : '';
    const avatarUrl = fromContact || fromRow || null;
    return avatarUrl === row.avatarUrl ? row : { ...row, avatarUrl };
  });
}

export function sortInboxRows(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}
