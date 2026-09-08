import { describe, expect, it } from 'vitest';
import {
  findChatContact,
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
  ];

  it('resolves by canonical id, alias, and virtualEmployeeId', () => {
    expect(findChatContact(contacts, 've-1')?.name).toBe('Ada');
    expect(findChatContact(contacts, 'mongo-1')?.id).toBe('ve-1');
    expect(findChatContact(contacts, 'missing')).toBeNull();
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
