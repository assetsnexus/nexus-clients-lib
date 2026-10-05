export type InboxKind = 'human' | 'agent' | 'group' | 'room';
export type KindFilter = 'all' | 'humans' | 'agents' | 'groups' | 'pinned';

export type InboxRow = {
  id: string;
  identityKey: string;
  identityLabel: string;
  identityLogo: string | null;
  conversationId: string;
  contactId: string | null;
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
    title,
    summary: textOf(raw, ['summary', 'lastMessage', 'preview', 'lastText']),
    avatarUrl: textOf(raw, ['avatarUrl', 'photoUrl', 'imageUrl']) || null,
    kind,
    unreadCount: Number(raw.unreadCount || raw.unread || 0) || 0,
    updatedAt: timeOf(raw),
    pinned: Boolean(raw.pinned),
  };
}

export function sortInboxRows(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}
