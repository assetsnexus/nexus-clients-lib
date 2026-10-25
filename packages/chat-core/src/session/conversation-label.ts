/**
 * The single label-precedence rule for a conversation/room/contact row.
 *
 * The region resolves a human-readable `displayTitle` for every
 * `anx.communicate.conversations.list` row (stored title → agent name → a
 * neutral literal) precisely so a client never has to synthesize a name. Before
 * that field existed, clients fell back to `conversationId` and rendered an
 * opaque internal id (`1792316062792-nm26u6zve`) where a person's name belongs —
 * that is a bug, not a design. **A raw id is never a label.**
 *
 * Every adapter (chat-core mappings, chat-react inbox rows and action sheet, the
 * Vue 2/3 panels) resolves through here rather than forking a second rule, so
 * the precedence cannot drift between surfaces.
 */

/** Shown when a row has neither a resolved label nor a resolvable name. */
export const UNTITLED_CONVERSATION_LABEL = 'Untitled conversation';

/** Region-resolved label keys, highest priority first. */
const LABEL_KEYS = ['displayTitle'] as const;
/** Stored user-facing label keys (a named room / thread), next. */
const TITLE_KEYS = ['title', 'name', 'customName', 'displayName'] as const;
/** Agent/participant name keys, next. */
const NAME_KEYS = ['agentName'] as const;
/** Partner/participant fallbacks used when the row carries no agent name. */
const PARTNER_KEYS = ['participantLabel', 'contactName'] as const;

/**
 * Internal id shapes the region/Mongo emit. Deliberately conservative: an
 * accidental match would hide a real name, so only well-known opaque shapes are
 * rejected (UUID, 24-hex Mongo ObjectId, `<epoch-ms>-<suffix>` region ids).
 */
const INTERNAL_ID_PATTERNS: RegExp[] = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[0-9a-f]{24}$/i,
  /^\d{10,}-[a-z0-9]{6,}$/i,
];

/** True when `value` is an internal identifier and must not be shown as a name. */
export function looksLikeInternalId(value: unknown): boolean {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return false;
  return INTERNAL_ID_PATTERNS.some((re) => re.test(text));
}

function textOf(raw: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * First non-empty string across `keys` that is safe to show: an internal id or
 * the row's own conversation id is skipped rather than rendered as a name.
 */
function labelOf(raw: Record<string, unknown>, keys: readonly string[]): string {
  const conversationId = textOf(raw, ['conversationId', 'id', '_id']);
  for (const key of keys) {
    const value = textOf(raw, [key]);
    if (!value) continue;
    if (looksLikeInternalId(value)) continue;
    if (conversationId && value === conversationId) continue;
    return value;
  }
  return '';
}

/** Partner/participant names, which may arrive as `participantNames` or a single label. */
export function conversationPartnerNameOf(raw: Record<string, unknown> | null | undefined): string {
  if (!raw || typeof raw !== 'object') return '';
  const single = labelOf(raw, PARTNER_KEYS);
  if (single) return single;
  const names = raw.participantNames;
  if (Array.isArray(names)) {
    return names
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n && !looksLikeInternalId(n))
      .join(', ');
  }
  return '';
}

/**
 * Resolve the label a person should read for one row.
 *
 * Precedence: the region's `displayTitle`, then a stored `title`/`name`, then
 * the `agentName`, then a partner/participant name, then
 * {@link UNTITLED_CONVERSATION_LABEL}. It **never** returns the raw
 * `conversationId`.
 */
export function resolveConversationLabel(raw: Record<string, unknown> | null | undefined): string {
  if (!raw || typeof raw !== 'object') return UNTITLED_CONVERSATION_LABEL;
  return (
    labelOf(raw, LABEL_KEYS) ||
    labelOf(raw, TITLE_KEYS) ||
    labelOf(raw, NAME_KEYS) ||
    conversationPartnerNameOf(raw) ||
    UNTITLED_CONVERSATION_LABEL
  );
}
