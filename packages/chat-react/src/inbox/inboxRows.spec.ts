import { describe, expect, it } from 'vitest';
import { conversationToRow, matchesKindFilter, sortInboxRows, unwrapList } from './inboxRows.js';

describe('inbox rows', () => {
  it('unwraps nested conversation lists', () => {
    expect(unwrapList({ responseObject: { conversations: [{ id: 'a' }] } }, ['conversations'])).toEqual([{ id: 'a' }]);
  });

  it('scopes row ids by identity and sorts by activity', () => {
    const older = conversationToRow(
      { id: 'c1', title: 'Ada', updatedAt: '2026-01-01T00:00:00.000Z', kind: 'human' },
      { key: 'u:private', label: 'Private', logo: null },
    );
    const newer = conversationToRow(
      { conversationId: 'c2', name: 'Agent', updatedAt: '2026-02-01T00:00:00.000Z', agentId: 'ag1' },
      { key: 'u:org', label: 'Org', logo: 'logo' },
    );
    expect(older?.id).toBe('u:private|c1');
    expect(newer?.kind).toBe('agent');
    expect(sortInboxRows([older!, newer!]).map((row) => row.id)).toEqual(['u:org|c2', 'u:private|c1']);
  });

  it('filters humans, agents, groups, and pinned', () => {
    const human = conversationToRow({ id: 'h', kind: 'human' }, { key: 'k', label: 'P', logo: null })!;
    const agent = conversationToRow({ id: 'a', agentId: 'x' }, { key: 'k', label: 'P', logo: null })!;
    const group = conversationToRow({ id: 'g', type: 'group', pinned: true }, { key: 'k', label: 'P', logo: null })!;
    expect(matchesKindFilter(human, 'humans')).toBe(true);
    expect(matchesKindFilter(agent, 'agents')).toBe(true);
    expect(matchesKindFilter(group, 'groups')).toBe(true);
    expect(matchesKindFilter(group, 'pinned')).toBe(true);
    expect(matchesKindFilter(human, 'pinned')).toBe(false);
  });
});
