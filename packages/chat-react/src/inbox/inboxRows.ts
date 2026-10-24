export type InboxKind = 'human' | 'agent' | 'group' | 'room';
export type KindFilter = 'all' | 'humans' | 'agents' | 'groups' | 'pinned';

/** Presence dot states, mirroring the portal session row (`presenceStatus`). */
export type InboxPresence =
  | 'online'
  | 'connecting'
  | 'offline'
  | 'error'
  | 'disabled'
  | 'edge-online'
  | 'edge-offline'
  | 'registry-offline-edge-online'
  | 'both-offline';

/** Ownership badge for an agent row (portal `agentScopeBadges`). */
export type InboxScopeBadge = { key: string; text: string; tone: 'platform' | 'org' | 'private' | 'asset' };

export type InboxRow = {
  id: string;
  identityKey: string;
  identityLabel: string;
  identityLogo: string | null;
  /** Owning org id of the *agent* on the row (portal `agentScopeBadges`), not the listing identity. */
  orgId: string | null;
  /** Org id of the identity that listed the row (null = private identity). */
  identityOrgId: string | null;
  conversationId: string;
  contactId: string | null;
  /** Region virtual employee id when the list row included one. */
  virtualEmployeeId: string | null;
  agentId: string | null;
  title: string;
  summary: string;
  avatarUrl: string | null;
  /** Name the avatar initials follow: the agent/contact, never the room title. */
  avatarName: string;
  /** Agent nickname when the region reported one. */
  agentName: string | null;
  kind: InboxKind;
  /** Agent ownership scope (`global` | `org` | `private`), when reported. */
  scope: string | null;
  unreadCount: number;
  updatedAt: number;
  pinned: boolean;
  /** Assistant turn in flight (`generationInProgress` / `isStreaming`). */
  streaming: boolean;
  /** Live subagent runs under this conversation (portal `activeSubAgentCount`). */
  activeSubAgentCount: number;
  /** Linked child conversations (subagent / agent_run). */
  subagentCount: number;
  /** A background subagent finished with no live run — session-list "Done". */
  backgroundSubAgentCompleted: boolean;
  /** Set on subagent / agent_run rows so the list can nest them. */
  parentConversationId: string | null;
  conversationRole: 'primary' | 'subagent' | 'agent_run' | 'notifications' | null;
  /** `Agent.contactStatus` — `disabled` renders a gray presence dot. */
  contactStatus: 'available' | 'away' | 'disabled' | null;
  /** Asset-node presence, when the row is an asset agent. */
  assetPresence: InboxPresence | null;
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
  // `lastActivityAt` is what `anx.communicate.conversations.list` returns, so
  // the single-identity list sorts the same way as the identity inbox.
  const value = raw.updatedAt || raw.lastActivityAt || raw.lastMessageAt || raw.createdAt;
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
  identity: { key: string; label: string; logo: string | null; orgId?: string | null },
): InboxRow | null {
  const conversationId = textOf(raw, ['conversationId', 'id', '_id']);
  if (!conversationId) return null;
  const kind = classifyKind(raw);
  const title = conversationTitleOf(raw);
  const parentConversationId = textOf(raw, ['parentConversationId']) || null;
  const role = textOf(raw, ['conversationRole']).toLowerCase();
  return {
    id: `${identity.key}|${conversationId}`,
    identityKey: identity.key,
    identityLabel: identity.label,
    identityLogo: identity.logo,
    orgId: textOf(raw, ['orgId', 'agentOrgId']) || null,
    identityOrgId: identity.orgId ?? null,
    conversationId,
    contactId: textOf(raw, ['contactId', 'agentId', 'peerId']) || null,
    virtualEmployeeId: textOf(raw, ['virtualEmployeeId', 'anxVeId']) || null,
    agentId: textOf(raw, ['agentId']) || null,
    title,
    summary: conversationSubtitleOf(raw, title),
    avatarUrl: inboxAvatarFromRow(raw),
    avatarName: textOf(raw, ['agentName']) || partnerNameOf(raw) || title,
    agentName: textOf(raw, ['agentName']) || null,
    kind,
    scope: textOf(raw, ['scope']) || null,
    unreadCount: Number(raw.unreadCount || raw.unread || 0) || 0,
    updatedAt: timeOf(raw),
    pinned: Boolean(raw.pinned),
    streaming: Boolean(raw.generationInProgress || raw.isStreaming || raw.streaming),
    activeSubAgentCount: numberOr(raw, ['activeSubAgentCount', 'activeSubagentCount']),
    subagentCount: numberOr(raw, ['subagentCount']),
    backgroundSubAgentCompleted: Boolean(raw.backgroundSubAgentCompleted),
    parentConversationId,
    conversationRole:
      role === 'primary' || role === 'subagent' || role === 'agent_run' || role === 'notifications'
        ? role
        : null,
    contactStatus:
      raw.contactStatus === 'available' || raw.contactStatus === 'away' || raw.contactStatus === 'disabled'
        ? raw.contactStatus
        : null,
    assetPresence: asPresence(raw.assetPresence),
  };
}

function numberOr(raw: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function asPresence(value: unknown): InboxPresence | null {
  const allowed: InboxPresence[] = [
    'online',
    'connecting',
    'offline',
    'error',
    'disabled',
    'edge-online',
    'edge-offline',
    'registry-offline-edge-online',
    'both-offline',
  ];
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as InboxPresence)
    : null;
}

/**
 * Presence dot for a row, mirroring the portal `SessionList.presenceStatus`:
 * a disabled agent is gray, an asset row reports its asset-node state, and a
 * plain row follows the shared activity connection.
 */
export function inboxPresenceStatus(
  row: Pick<InboxRow, 'contactStatus' | 'assetPresence'>,
  connection: string,
): InboxPresence {
  if (row.contactStatus === 'disabled') return 'disabled';
  if (row.assetPresence) return row.assetPresence;
  if (connection === 'error') return 'error';
  if (connection === 'connected') return 'online';
  if (connection === 'connecting') return 'connecting';
  return 'offline';
}

export function inboxPresenceTitle(status: InboxPresence): string {
  switch (status) {
    case 'disabled':
      return 'Agent disabled by owner';
    case 'edge-online':
      return 'Edge online';
    case 'edge-offline':
      return 'Edge offline';
    case 'registry-offline-edge-online':
      return 'Registry offline, edge online';
    case 'both-offline':
      return 'Registry and edge offline';
    case 'error':
      return 'Realtime connection error';
    case 'online':
      return 'Realtime connected';
    case 'connecting':
      return 'Connecting…';
    default:
      return 'Realtime offline';
  }
}

/**
 * Ownership badge for an agent row (portal `agentScopeBadges`). Ownership is
 * `scope` + the agent's own `orgId`, never the identity the row was listed
 * under: an org identity lists every agent it can see, including private ones.
 */
export function inboxScopeBadge(row: InboxRow, orgName?: string | null): InboxScopeBadge | null {
  if (row.kind !== 'agent') return null;
  if (row.scope === 'global') return { key: 'platform', text: 'Platform', tone: 'platform' };
  if (row.orgId) {
    const name = (orgName || '').trim();
    return { key: 'org', text: name || 'Organization', tone: 'org' };
  }
  return { key: 'private', text: 'Private', tone: 'private' };
}

/** Subagent / agent-run row: nested under its parent when one is present. */
export function isSubagentRow(row: Pick<InboxRow, 'parentConversationId' | 'conversationRole'>): boolean {
  return row.conversationRole === 'subagent' || row.conversationRole === 'agent_run' || Boolean(row.parentConversationId);
}

/**
 * Child rows to show in a parent's nest (portal `filterNestedSubagentsForParent`):
 * running always, the open child always, and a completed child only while it
 * still needs attention and its parent is not the focused row.
 */
export function nestedSubagentsFor(
  parent: InboxRow,
  rows: InboxRow[],
  opts: { parentFocused?: boolean; activeRowId?: string | null } = {},
): InboxRow[] {
  const kids = rows.filter(
    (row) => isSubagentRow(row) && row.parentConversationId === parent.conversationId,
  );
  return kids
    .filter((child) => {
      if (child.streaming) return true;
      if (child.id === opts.activeRowId) return true;
      if (opts.parentFocused) return false;
      return child.unreadCount > 0;
    })
    .sort((a, b) => Number(b.streaming) - Number(a.streaming) || b.updatedAt - a.updatedAt);
}

/** Parent rows plus the child rows that stay visible on their own. */
export function partitionSubagentRows(rows: InboxRow[]): { parents: InboxRow[]; children: InboxRow[] } {
  const parentIds = new Set(
    rows.filter((row) => !isSubagentRow(row) && row.conversationId).map((row) => row.conversationId),
  );
  const parents: InboxRow[] = [];
  const children: InboxRow[] = [];
  for (const row of rows) {
    if (!isSubagentRow(row)) {
      parents.push(row);
      continue;
    }
    // Nest under a present parent; otherwise keep orphan running / active rows.
    if (row.parentConversationId && parentIds.has(row.parentConversationId)) continue;
    if (row.streaming) children.push(row);
  }
  return { parents, children };
}

/**
 * Collapse rows to the most recent conversation per contact (portal
 * `latestSessionPerContact`). "Latest" answers "who can I talk to" instead of
 * "which threads exist". Pinned rows, subagent rows, and the open row always
 * survive — hiding the thread you are reading reads as a bug.
 */
export function latestInboxPerContact(
  rows: InboxRow[],
  opts: { isActive?: (row: InboxRow) => boolean } = {},
): InboxRow[] {
  const keyOf = (row: InboxRow): string | null => {
    if (row.kind === 'room' || row.kind === 'group') return null;
    return (row.contactId || row.virtualEmployeeId || row.agentId || '').trim() || null;
  };
  const winner = new Map<string, number>();
  rows.forEach((row, index) => {
    if (isSubagentRow(row) || row.pinned || opts.isActive?.(row)) return;
    const key = keyOf(row);
    if (!key) return;
    const prev = winner.get(key);
    if (prev == null || row.updatedAt > rows[prev].updatedAt) winner.set(key, index);
  });
  const keep = new Set(winner.values());
  return rows.filter((row, index) => {
    const key = keyOf(row);
    if (!key || isSubagentRow(row) || row.pinned || opts.isActive?.(row)) return true;
    return keep.has(index);
  });
}

/** Identity logo shown on a row: the org logo for a business identity, the avatar for a private one. */
export function identityRowLogo(identity: {
  orgId?: string | null;
  orgLogo?: string | null;
  avatarUrl?: string | null;
}): string | null {
  if (!identity.orgId) return identity.avatarUrl || null;
  return identity.orgLogo || null;
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

/**
 * Synthetic identity for single-identity hosts.
 *
 * The desktop shell and the embed keep only one live token in the renderer, so
 * there is no identity list to fan out over. The portal-parity sidebar still
 * needs an `identityKey` on every row (owner logo, per-row auth routing), so
 * those hosts map their plain conversation rows through this placeholder. It
 * never matches a real session key, which is what keeps the identity chip row
 * and the per-row `updateAuth` switch dormant.
 */
export const SINGLE_IDENTITY_KEY = '__single__';

/**
 * Adapt plain `conversations.list` rows (single-identity hosts) into sidebar
 * rows, so the same `ConversationInbox` renders for one identity and for many.
 */
export function inboxRowsFromConversationRows(
  rows: Array<Record<string, unknown>>,
  contacts: Array<{
    id?: string | null;
    virtualEmployeeId?: string | null;
    agentId?: string | null;
    avatarUrl?: string | null;
  }> = [],
  identity: { label?: string; logo?: string | null; orgId?: string | null } = {},
): InboxRow[] {
  const mapped: InboxRow[] = [];
  for (const raw of rows) {
    const row = conversationToRow(raw, {
      key: SINGLE_IDENTITY_KEY,
      label: identity.label || '',
      logo: identity.logo ?? null,
      orgId: identity.orgId ?? null,
    });
    if (row) mapped.push(row);
  }
  return sortInboxRows(mergeInboxAgentAvatars(mapped, contacts));
}
