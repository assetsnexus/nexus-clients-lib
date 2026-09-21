import { describe, expect, it } from 'vitest';
import {
  findChatContact,
  chatContactsAreSameIdentity,
  mergeContactAvatarUrl,
  applyPanelAvatarOnContactSwitch,
  resolveConversationAvatarUrl,
  chatModelPriceLevel,
  modelPriceSymbols,
  normalizeComputeTier,
  computeTierIcon,
} from './index.js';
import type { ChatContact } from './types.js';

describe('findChatContact', () => {
  const contacts: ChatContact[] = [
    {
      id: 've-1',
      name: 'Ada',
      type: 'agent',
      virtualEmployeeId: 've-1',
      aliases: ['mongo-1'],
      avatarUrl: 'https://example/a.png',
    },
    {
      id: 've-2',
      name: 'Bea',
      type: 'agent',
      virtualEmployeeId: 've-2',
      agentId: 'shared-agent',
      aliases: ['shared-agent'],
      avatarUrl: 'https://example/b.png',
    },
  ];

  it('resolves by canonical id, alias, and virtualEmployeeId', () => {
    expect(findChatContact(contacts, 've-1')?.name).toBe('Ada');
    expect(findChatContact(contacts, 'mongo-1')?.id).toBe('ve-1');
    expect(findChatContact(contacts, 'missing')).toBeNull();
  });

  it('prefers VE id over a shared sidecar agentId', () => {
    expect(findChatContact(contacts, 've-2')?.name).toBe('Bea');
    expect(findChatContact(contacts, 'shared-agent')?.id).toBe('ve-2');
  });
});

describe('agent avatar identity', () => {
  it('does not treat two VEs as the same contact when only agentId overlaps', () => {
    expect(
      chatContactsAreSameIdentity(
        { id: 've-1', virtualEmployeeId: 've-1', agentId: 'shared', aliases: ['shared'] },
        { id: 've-2', virtualEmployeeId: 've-2', agentId: 'shared', aliases: ['shared'] },
      ),
    ).toBe(false);
  });

  it('keeps a hydrated avatar for the same VE and drops it when identity changes', () => {
    expect(mergeContactAvatarUrl('old.png', null, true)).toBe('old.png');
    expect(mergeContactAvatarUrl('old.png', null, false)).toBeNull();
    expect(mergeContactAvatarUrl('old.png', 'new.png', true)).toBe('new.png');
  });

  it('clears panel avatar when switching contacts', () => {
    expect(
      applyPanelAvatarOnContactSwitch({
        prevContactId: 've-1',
        nextContactId: 've-2',
        prevAvatarUrl: 'https://cdn/a.png',
        nextAvatarUrl: null,
      }),
    ).toBeNull();
    expect(
      applyPanelAvatarOnContactSwitch({
        prevContactId: 've-1',
        nextContactId: 've-1',
        prevAvatarUrl: 'https://cdn/a.png',
        nextAvatarUrl: null,
      }),
    ).toBe('https://cdn/a.png');
  });

  it('does not fall back to another contact\'s panel avatar', () => {
    expect(
      resolveConversationAvatarUrl(
        { id: 've-2', virtualEmployeeId: 've-2', avatarUrl: null },
        { contactId: 've-1', avatarUrl: 'https://cdn/a.png' },
      ),
    ).toBeNull();
    expect(
      resolveConversationAvatarUrl(
        { id: 've-2', virtualEmployeeId: 've-2', avatarUrl: 'https://cdn/contact.png' },
        { contactId: 've-2', avatarUrl: 'https://cdn/session.png' },
      ),
    ).toBe('https://cdn/session.png');
    expect(
      resolveConversationAvatarUrl(
        { id: 've-2', virtualEmployeeId: 've-2', avatarUrl: 'https://cdn/b.png' },
        { contactId: 've-2', avatarUrl: null },
      ),
    ).toBe('https://cdn/b.png');
  });
});

describe('compute tier helpers', () => {
  it('normalizes tiers and price symbols', () => {
    expect(normalizeComputeTier('FAST')).toBe('fast');
    expect(computeTierIcon('balanced')).toBeTruthy();
    expect(chatModelPriceLevel(0)).toBe(0);
    expect(modelPriceSymbols(3)).toBe('$$$');
    expect(modelPriceSymbols(0)).toBe('–');
  });
});
