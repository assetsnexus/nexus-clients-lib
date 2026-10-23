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

/** Shown when a thread has no stored title and no agent nickname (portal parity). */
export const UNTITLED_CONVERSATION_LABEL = 'Untitled conversation';

/** Partner/participant names, which may arrive as `participantNames` or a single label. */
function partnerNameOf(raw: Record<string, unknown>): string {
  const single = textOf(raw, ['participantLabel', 'contactName']);
  if (single) return single;
  const names = raw.participantNames;
  if (Array.isArray(names)) {
    return names.map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean).join(', ');
  }
  return '';
}

/**
 * Row label, mirroring the portal session list (`conversationListTitle`): the
 * stored room title, then the agent nickname, then the partner/participant
 * name. The region returns `title: null` for most agent DMs, so a mapper that
 * reads only `title`/`name` degrades every row to a generic placeholder.
 */
export function conversationTitleOf(raw: Record<string, unknown>): string {
  return (
    textOf(raw, ['title', 'name', 'customName', 'displayName']) ||
    textOf(raw, ['agentName']) ||
    partnerNameOf(raw) ||
    UNTITLED_CONVERSATION_LABEL
  );
}

/** One-line row subtitle; never repeats the title. */
export function conversationSubtitleOf(raw: Record<string, unknown>, title: string): string {
  const summary = textOf(raw, [
    'oneLineSummary',
    'lastMessagePreview',
    'summary',
    'lastMessage',
    'preview',
    'lastText',
  ]);
  return summary && summary !== title ? summary : '';
}

/** Row identity keys that a contact can be matched on (portal `indexContactsById` parity). */
function rowContactKeys(raw: Record<string, unknown>): string[] {
  return ['virtualEmployeeId', 'anxVeId', 'virtualAgentId', 'agentId', 'peerUserId', 'contactId']
    .map((key) => textOf(raw, [key]))
    .filter(Boolean);
}

function contactMatchesRow(
  contact: { id?: string | null; virtualEmployeeId?: string | null; agentId?: string | null },
  raw: Record<string, unknown>,
): boolean {
  const keys = [contact.id, contact.virtualEmployeeId, contact.agentId]
    .map((value) => (value || '').trim())
    .filter(Boolean);
  if (!keys.length) return false;
  return rowContactKeys(raw).some((key) => keys.includes(key));
}

export type ConversationRowView = {
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  /** Name the avatar initials follow: the agent/contact, never the room title. */
  avatarName: string;
};

/**
 * Presentation model for one list row: the portal's title precedence, its
 * subtitle, and an avatar resolved from the loaded contacts first, then the
 * row itself. Used by both the identity inbox and the single-identity list.
 */
export function conversationRowView(
  raw: Record<string, unknown>,
  contacts: Array<{
    id?: string | null;
    virtualEmployeeId?: string | null;
    agentId?: string | null;
    avatarUrl?: string | null;
  }> = [],
): ConversationRowView {
  const title = conversationTitleOf(raw);
  const contact = contacts.find((item) => contactMatchesRow(item, raw));
  const fromContact = typeof contact?.avatarUrl === 'string' ? contact.avatarUrl.trim() : '';
  const fromRow = inboxAvatarFromRow(raw);
  return {
    title,
    subtitle: conversationSubtitleOf(raw, title),
    avatarUrl: fromContact || fromRow || null,
    // Portal `sessionAvatarName`: the agent/partner identity, not the title.
    avatarName: textOf(raw, ['agentName']) || partnerNameOf(raw) || title,
  };
}

/**
 * Letters for the avatar fallback, from the agent/contact name. Mirrors the
 * portal `SessionList.initials`: two words take their first letters ("Ada
 * Lovelace" -> AL), one word takes its first two characters ("Veyla" -> VE).
 */
export function conversationInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || '?';
}

export function conversationToRow(
  raw: Record<string, unknown>,
  identity: { key: string; label: string; logo: string | null },
): InboxRow | null {
  const conversationId = textOf(raw, ['conversationId', 'id', '_id']);
  if (!conversationId) return null;
  const kind = classifyKind(raw);
  const title = conversationTitleOf(raw);
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
    summary: conversationSubtitleOf(raw, title),
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

/**
 * Resolve which contact an inbox row belongs to before opening its conversation.
 *
 * The region's `conversations.list` reports `contactId: null` for agent DMs and
 * only populates `virtualEmployeeId` (VE id) and/or the sidecar `agentId`. If a
 * caller forwards only `row.contactId`, the chat panel opens unbound: the header
 * falls back to a generic title and the host cannot resolve the agent, so call /
 * companion-mode affordances disappear. Prefer the canonical contact matched by
 * the shared identity matcher, then degrade through the raw row keys.
 */
export function ownerContactIdForRow(
  row: Pick<InboxRow, 'contactId' | 'virtualEmployeeId' | 'agentId'>,
  resolve: (id: string) => Partial<{ id?: string | null }> | null | undefined,
): string | undefined {
  const candidates = [row.contactId, row.virtualEmployeeId, row.agentId]
    .map((value) => (value || '').trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const match = resolve(candidate);
    const id = match?.id ? String(match.id).trim() : '';
    if (id) return id;
  }
  return candidates[0];
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
