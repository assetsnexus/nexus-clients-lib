import { describe, expect, it } from 'vitest';
import type { ChatContact } from '@nexus/chat-core';
import {
  dedupePickerContacts,
  filterPickerContacts,
  isOrgAgentContact,
  pickerGroups,
  pickerPool,
} from './pickerContacts.js';

const contact = (over: Partial<ChatContact> & { id: string }): ChatContact =>
  ({ name: over.id, type: 'agent', ...over }) as ChatContact;

const ownAgent = contact({ id: 'a-own', name: 'Veyla', type: 'agent' });
const orgAgent = contact({ id: 'a-org', name: 'Blue Axion', type: 'agent', orgId: 'org-1' });
const ownAsset = contact({ id: 'as-own', name: 'Printer', type: 'asset_agent', relation: 'owner' });
const otherAsset = contact({ id: 'as-op', name: 'Shared printer', type: 'asset_agent', relation: 'operator' });
const person = contact({ id: 'u-1', name: 'Ada Lovelace', type: 'user' });

describe('picker contacts', () => {
  it('classifies an org agent from scope or orgId', () => {
    expect(isOrgAgentContact(orgAgent)).toBe(true);
    expect(isOrgAgentContact(contact({ id: 'a', scope: 'org' }))).toBe(true);
    expect(isOrgAgentContact(ownAgent)).toBe(false);
    // Only agents: an asset with an org is still not an "org agent".
    expect(isOrgAgentContact({ ...ownAsset, orgId: 'org-1' })).toBe(false);
  });

  it("keeps the caller's own user-scoped agent (orgId:null) in the own-agents group", () => {
    // A `scope:'user', orgId:null` agent listed while acting in an org is
    // personal, so it belongs with "Own agents" — not "Org agents" — and it is
    // never dropped from the picker pool.
    const selene = contact({ id: 'a-selene', name: 'Selene', type: 'agent', scope: 'user', orgId: null });
    expect(isOrgAgentContact(selene)).toBe(false);
    const groups = pickerGroups([ownAgent, selene, orgAgent], 'agent');
    expect(groups.find((g) => g.id === 'own_agents')!.contacts.map((c) => c.id)).toEqual(['a-own', 'a-selene']);
    expect(groups.find((g) => g.id === 'org_agents')!.contacts.map((c) => c.id)).toEqual(['a-org']);
  });

  it('offers agents + assets for agent mode and people for dm mode', () => {
    const all = [ownAgent, orgAgent, ownAsset, otherAsset, person];
    expect(pickerPool(all, 'agent').map((c) => c.id)).toEqual(['a-own', 'a-org', 'as-own', 'as-op']);
    expect(pickerPool(all, 'dm').map((c) => c.id)).toEqual(['u-1']);
  });

  it('filters case-insensitively by name and keeps everything on a blank query', () => {
    const all = [ownAgent, person];
    expect(filterPickerContacts(all, '')).toHaveLength(2);
    expect(filterPickerContacts(all, 'ADA').map((c) => c.id)).toEqual(['u-1']);
    expect(filterPickerContacts(all, '  veyla  ').map((c) => c.id)).toEqual(['a-own']);
    expect(filterPickerContacts(all, 'nothing')).toEqual([]);
  });

  it('groups agent mode into own/org agents and own/other assets', () => {
    const groups = pickerGroups([ownAgent, orgAgent, ownAsset, otherAsset], 'agent');
    expect(groups.map((g) => g.id)).toEqual(['own_agents', 'org_agents', 'own_assets', 'other_assets']);
    expect(groups.map((g) => g.label)).toEqual(['Own agents', 'Org agents', 'Own assets', 'Other assets']);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(['a-own']);
    expect(groups[3].contacts.map((c) => c.id)).toEqual(['as-op']);
  });

  it('narrows the assets tab to talkable assets only', () => {
    const groups = pickerGroups([ownAgent, orgAgent, ownAsset, otherAsset], 'agent', 'assets');
    expect(groups.map((g) => g.id)).toEqual(['own_assets', 'other_assets']);
    expect(groups.flatMap((g) => g.contacts.map((c) => c.id))).toEqual(['as-own', 'as-op']);
  });

  it('drops empty groups and keeps one unlabeled list for dm mode', () => {
    expect(pickerGroups([ownAgent], 'agent').map((g) => g.id)).toEqual(['own_agents']);
    const dm = pickerGroups([person], 'dm');
    expect(dm).toHaveLength(1);
    expect(dm[0]).toMatchObject({ id: 'people', label: null });
    expect(dm[0].contacts.map((c) => c.id)).toEqual(['u-1']);
  });

  it('dedupes by id, keeping the first occurrence', () => {
    const first = contact({ id: 'dup', name: 'First' });
    const second = contact({ id: 'dup', name: 'Second' });
    expect(dedupePickerContacts([first, second]).map((c) => c.name)).toEqual(['First']);
    // Rows without an id are dropped rather than becoming a keyless entry.
    expect(dedupePickerContacts([contact({ id: '' }), person]).map((c) => c.id)).toEqual(['u-1']);
  });
});
