import type { ChatContact } from '@nexus/chat-core';

/**
 * Contact grouping for the "Message agent" / "Direct message" pickers.
 *
 * Mirrors the portal's `utils/messageAgentPicker.js`: the agent picker groups
 * own vs org agents plus own vs operator assets, the DM picker is one flat list
 * of people. Pure so it can be unit-tested without a DOM.
 */

export type PickerMode = 'agent' | 'dm';
export type AgentPickerTab = 'general' | 'assets';

export type PickerGroup = {
  id: string;
  label: string | null;
  contacts: ChatContact[];
};

/** Agent owned by an organisation (portal `isOrgAgentContact`). */
export function isOrgAgentContact(contact: Pick<ChatContact, 'type' | 'scope' | 'orgId'>): boolean {
  if (!contact || contact.type !== 'agent') return false;
  if (contact.scope === 'org' || contact.orgId) return true;
  return false;
}

/** Contacts the picker is allowed to offer for a mode. */
export function pickerPool(contacts: ChatContact[], mode: PickerMode): ChatContact[] {
  const rows = Array.isArray(contacts) ? contacts.filter(Boolean) : [];
  if (mode === 'agent') return rows.filter((c) => c.type === 'agent' || c.type === 'asset_agent');
  return rows.filter((c) => c.type === 'user');
}

/** Case-insensitive name search; a blank query keeps every contact. */
export function filterPickerContacts(contacts: ChatContact[], query: string): ChatContact[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  return contacts.filter((c) => String(c.name || '').toLowerCase().includes(q));
}

function present(groups: PickerGroup[]): PickerGroup[] {
  return groups.filter((group) => group.contacts.length);
}

/**
 * Grouped picker rows. The DM mode is a single unlabeled list; the agent mode
 * splits own/org agents and own/operator assets, with the Assets tab narrowing
 * to talkable assets only.
 */
export function pickerGroups(
  contacts: ChatContact[],
  mode: PickerMode,
  tab: AgentPickerTab = 'general',
): PickerGroup[] {
  if (mode !== 'agent') {
    return [{ id: 'people', label: null, contacts }];
  }
  const agents = contacts.filter((c) => c.type === 'agent');
  const assets = contacts.filter((c) => c.type === 'asset_agent');
  const ownAgents = agents.filter((c) => !isOrgAgentContact(c));
  const orgAgents = agents.filter((c) => isOrgAgentContact(c));
  const ownAssets = assets.filter((c) => c.relation !== 'operator');
  const otherAssets = assets.filter((c) => c.relation === 'operator');
  if (tab === 'assets') {
    return present([
      { id: 'own_assets', label: 'Own assets', contacts: ownAssets },
      { id: 'other_assets', label: 'Other assets', contacts: otherAssets },
    ]);
  }
  return present([
    { id: 'own_agents', label: 'Own agents', contacts: ownAgents },
    { id: 'org_agents', label: 'Org agents', contacts: orgAgents },
    { id: 'own_assets', label: 'Own assets', contacts: ownAssets },
    { id: 'other_assets', label: 'Other assets', contacts: otherAssets },
  ]);
}

/**
 * Deduplicate a contact list by id, keeping the first occurrence (the live
 * directory wins over a cached row).
 */
export function dedupePickerContacts(rows: ChatContact[]): ChatContact[] {
  const seen = new Set<string>();
  const out: ChatContact[] = [];
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
