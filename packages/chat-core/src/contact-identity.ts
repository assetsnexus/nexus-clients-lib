import type { ChatContact } from './types.js';

function norm(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function trimUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v || null;
}

/**
 * Identity keys for matching a chat contact to itself across list/session upserts.
 * Sidecar `agentId` is intentionally omitted — it can collide across virtual employees.
 */
export function chatContactIdentityKeys(
  contact: Partial<ChatContact> | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!contact) return keys;
  const add = (value: unknown) => {
    const s = norm(value);
    if (s) keys.add(s);
  };
  add(contact.id);
  add(contact.virtualEmployeeId);
  const agentId = norm(contact.agentId);
  for (const alias of contact.aliases || []) {
    const s = norm(alias);
    if (!s || (agentId && s === agentId)) continue;
    keys.add(s);
  }
  return keys;
}

/** True when both records are the same person/agent — not merely the same sidecar Agent._id. */
export function chatContactsAreSameIdentity(
  a: Partial<ChatContact> | null | undefined,
  b: Partial<ChatContact> | null | undefined,
): boolean {
  if (!a || !b) return false;
  const aVe = norm(a.virtualEmployeeId);
  const bVe = norm(b.virtualEmployeeId);
  if (aVe && bVe && aVe !== bVe) return false;

  const aId = norm(a.id);
  const bId = norm(b.id);
  if (aId && bId && aId === bId) return true;
  if (aVe && bVe && aVe === bVe) return true;
  if (aVe && (bId === aVe || chatContactIdentityKeys(b).has(aVe))) return true;
  if (bVe && (aId === bVe || chatContactIdentityKeys(a).has(bVe))) return true;

  const aKeys = chatContactIdentityKeys(a);
  const bKeys = chatContactIdentityKeys(b);
  for (const key of aKeys) {
    if (bKeys.has(key)) return true;
  }
  return false;
}

export function mergeContactAvatarUrl(
  prev: string | null | undefined,
  incoming: string | null | undefined,
  sameIdentity: boolean,
): string | null {
  const next = trimUrl(incoming);
  const old = trimUrl(prev);
  if (!sameIdentity) return next;
  return next || old;
}

/**
 * When the main panel is rebound to another contact, never keep the previous
 * agent's picture. Same-contact rebinds may keep a hydrated URL until a new one arrives.
 */
export function applyPanelAvatarOnContactSwitch(args: {
  prevContactId?: string | null;
  nextContactId?: string | null;
  prevAvatarUrl?: string | null;
  nextAvatarUrl?: string | null;
}): string | null {
  const prevId = norm(args.prevContactId);
  const nextId = norm(args.nextContactId);
  const nextUrl = trimUrl(args.nextAvatarUrl);
  if (prevId && nextId && prevId !== nextId) return nextUrl;
  return nextUrl || trimUrl(args.prevAvatarUrl);
}

export function resolveConversationAvatarUrl(
  contact?: Partial<ChatContact> | null,
  panel?: {
    contactId?: string | null;
    avatarUrl?: string | null;
    virtualEmployeeId?: string | null;
  } | null,
): string | null {
  const contactUrl = trimUrl(contact?.avatarUrl);
  const panelUrl = trimUrl(panel?.avatarUrl);
  const panelId = panel?.contactId != null ? String(panel.contactId) : '';
  const panelMatchesContact =
    Boolean(panelUrl && panelId && contact) &&
    chatContactsAreSameIdentity(contact, {
      id: panelId,
      virtualEmployeeId: panel?.virtualEmployeeId || null,
    });
  // Session chrome (header / profile popup) must follow the open conversation,
  // not a leftover contact-store picture from another agent.
  if (panelMatchesContact) return panelUrl;
  if (contactUrl) return contactUrl;
  if (panelUrl && !contact) return panelUrl;
  return null;
}

/**
 * Index contacts for session overlay. Never let a later `agentId` steal another
 * contact's canonical / VE key.
 */
export function indexChatContactsById(
  contacts: Array<Partial<ChatContact> & { id?: string }> | null | undefined,
): Map<string, Partial<ChatContact> & { id?: string; avatarUrl?: string | null }> {
  const map = new Map<string, Partial<ChatContact> & { id?: string; avatarUrl?: string | null }>();
  const put = (
    key: unknown,
    contact: Partial<ChatContact> & { id?: string; avatarUrl?: string | null },
  ) => {
    const k = norm(key);
    if (!k || map.has(k)) return;
    map.set(k, contact);
  };
  for (const contact of contacts || []) {
    if (!contact?.id) continue;
    put(contact.id, contact);
    put(contact.virtualEmployeeId, contact);
    const agentId = norm(contact.agentId);
    for (const alias of contact.aliases || []) {
      if (agentId && norm(alias) === agentId) continue;
      put(alias, contact);
    }
    put(contact.agentId, contact);
  }
  return map;
}

/** Resolve a contact by canonical id, VE id, alias, then sidecar agentId last. */
export function findChatContact(
  contacts: ChatContact[] | undefined | null,
  contactId: string | null | undefined,
): ChatContact | null {
  const id = contactId == null ? '' : String(contactId).trim();
  if (!id || !Array.isArray(contacts)) return null;
  const byId = contacts.find((c) => c.id === id);
  if (byId) return byId;
  const byVe = contacts.find((c) => c.virtualEmployeeId === id);
  if (byVe) return byVe;
  const byAlias = contacts.find(
    (c) =>
      Array.isArray(c.aliases) &&
      c.aliases.includes(id) &&
      norm(c.agentId) !== id,
  );
  if (byAlias) return byAlias;
  return contacts.find((c) => c.agentId === id) || null;
}
