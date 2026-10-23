import { describe, expect, it } from 'vitest';
import {
  conversationInitials,
  conversationRowView,
  conversationToRow,
  filterInboxRowsForLockedAgent,
  matchesKindFilter,
  mergeInboxAgentAvatars,
  ownerContactIdForRow,
  sortInboxRows,
  unwrapList,
} from './inboxRows.js';
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

  it('shows the contact avatar the way the portal session list does', () => {
    const identity = { key: 'k', label: 'P', logo: null };
    const row = conversationToRow(
      {
        id: 'c1',
        virtualEmployeeId: 've-1',
        agent: { profilePicture: 'https://cdn.example/agent.png' },
      },
      identity,
    )!;
    expect(row.avatarUrl).toBe('https://cdn.example/agent.png');
    const merged = mergeInboxAgentAvatars(
      [{ ...row, avatarUrl: null }],
      [{ id: 've-1', virtualEmployeeId: 've-1', avatarUrl: 'https://cdn.example/contact.png' }],
    );
    expect(merged[0]?.avatarUrl).toBe('https://cdn.example/contact.png');
    const empty = mergeInboxAgentAvatars([{ ...row, avatarUrl: '  ' }], [{ id: 've-1', avatarUrl: '   ' }]);
    expect(empty[0]?.avatarUrl).toBeNull();
  });

  it('names a title-less agent DM after the agent, not a generic placeholder', () => {
    // Shape the region actually returns for most agent conversations:
    // `title: null` with `agentName` populated.
    const row = conversationToRow(
      {
        conversationId: '923a3904-f9a2-46e8-8883-a1a3feef7d49',
        title: null,
        agentId: 'ag-1',
        agentName: 'Xcamp',
        lastMessagePreview: 'What would you like to do?',
      },
      { key: 'u:private', label: 'Personal', logo: null },
    )!;
    expect(row.title).toBe('Xcamp');
    expect(row.title).not.toBe('Conversation');
    expect(row.summary).toBe('What would you like to do?');
  });

  it('keeps a stored room title over the agent name (portal precedence)', () => {
    const view = conversationRowView({
      conversationId: 'c9',
      title: 'Quick Ping',
      agentName: 'Rune',
      oneLineSummary: 'What are we growing this week?',
    });
    expect(view.title).toBe('Quick Ping');
    expect(view.subtitle).toBe('What are we growing this week?');
  });

  it('falls back to the participant label, then the untitled label', () => {
    expect(conversationRowView({ conversationId: 'r1', participantNames: ['Veyla'] }).title).toBe('Veyla');
    expect(conversationRowView({ conversationId: 'r2' }).title).toBe('Untitled conversation');
  });

  it('prefers the loaded contact avatar and derives initials from the agent name', () => {
    const view = conversationRowView(
      { conversationId: 'c1', title: 'Quick Ping', agentName: 'Xcamp', virtualEmployeeId: 've-1' },
      [{ id: 've-1', virtualEmployeeId: 've-1', avatarUrl: 'https://cdn.example/contact.png' }],
    );
    expect(view.avatarUrl).toBe('https://cdn.example/contact.png');
    // Portal parity: a renamed thread keeps the agent's initials, not the title's.
    expect(view.avatarName).toBe('Xcamp');
    expect(conversationInitials(view.avatarName)).toBe('XC');
    expect(conversationInitials('Ada Lovelace')).toBe('AL');
    expect(conversationInitials('')).toBe('?');
  });

  describe('ownerContactIdForRow', () => {
    const resolve = (map: Record<string, string>) => (id: string) =>
      map[id] ? { id: map[id] } : null;

    it('resolves the canonical contact from the VE id when contactId is null', () => {
      // Region list rows report contactId: null and only expose virtualEmployeeId.
      expect(
        ownerContactIdForRow(
          { contactId: null, virtualEmployeeId: 've-nox', agentId: 'agent-uuid' },
          resolve({ 've-nox': 've-nox' }),
        ),
      ).toBe('ve-nox');
    });

    it('resolves through an alias to the canonical contact id', () => {
      expect(
        ownerContactIdForRow(
          { contactId: null, virtualEmployeeId: 'alias-nox', agentId: null },
          resolve({ 'alias-nox': 've-nox' }),
        ),
      ).toBe('ve-nox');
    });

    it('falls back to the sidecar agent id when no contact matches', () => {
      expect(
        ownerContactIdForRow(
          { contactId: null, virtualEmployeeId: null, agentId: 'agent-uuid' },
          () => null,
        ),
      ).toBe('agent-uuid');
    });

    it('prefers the row contactId when it already resolves', () => {
      expect(
        ownerContactIdForRow(
          { contactId: 've-direct', virtualEmployeeId: 've-other', agentId: null },
          resolve({ 've-direct': 've-direct', 've-other': 've-other' }),
        ),
      ).toBe('ve-direct');
    });

    it('returns undefined when the row carries no identity keys', () => {
      expect(ownerContactIdForRow({ contactId: null, virtualEmployeeId: null, agentId: null }, () => null)).toBeUndefined();
    });
  });
});
