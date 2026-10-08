import { describe, expect, it } from 'vitest';
import { conversationToRow, filterInboxRowsForLockedAgent, matchesKindFilter, sortInboxRows, unwrapList } from './inboxRows.js';
import { loadIdentityInbox } from './loadIdentityInbox.js';

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

  it('drops a conversation for a different agent from a locked inbox', async () => {
    const identity = { key: 'k', label: 'P', logo: null };
    const mine = conversationToRow(
      { id: 'c-mine', virtualEmployeeId: 've-locked', title: 'Locked' },
      identity,
    )!;
    const other = conversationToRow(
      { id: 'c-other', virtualEmployeeId: 've-other', title: 'Other' },
      identity,
    )!;
    expect(filterInboxRowsForLockedAgent([mine, other], 've-locked').map((row) => row.conversationId)).toEqual([
      'c-mine',
    ]);

    const loaded = await loadIdentityInbox({
      identities: [
        {
          key: 'u1',
          label: 'Me',
          userId: 'user-1',
          orgId: null,
          role: null,
          deviceId: null,
          token: 'token',
          avatarUrl: null,
          orgLogo: null,
        },
      ],
      hiddenKeys: [],
      lockedAgent: { virtualEmployeeId: 've-locked' },
      send: async () => ({
        ok: true,
        data: {
          conversations: [
            { conversationId: 'mine', virtualEmployeeId: 've-locked', title: 'Locked' },
            { conversationId: 'other', virtualEmployeeId: 've-other', title: 'Other' },
          ],
        },
      }),
    });
    expect(loaded.rows.map((row) => row.conversationId)).toEqual(['mine']);
    expect(loaded.errors).toEqual([]);
  });
});
