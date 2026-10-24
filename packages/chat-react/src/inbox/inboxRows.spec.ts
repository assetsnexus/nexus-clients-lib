import { describe, expect, it } from 'vitest';
import {
  conversationInitials,
  conversationRowView,
  conversationToRow,
  filterInboxRowsForLockedAgent,
  identityRowLogo,
  inboxPresenceStatus,
  inboxPresenceTitle,
  inboxRowsFromConversationRows,
  inboxScopeBadge,
  isSubagentRow,
  latestInboxPerContact,
  matchesKindFilter,
  mergeInboxAgentAvatars,
  nestedSubagentsFor,
  ownerContactIdForRow,
  partitionSubagentRows,
  sortInboxRows,
  SINGLE_IDENTITY_KEY,
  unwrapList,
  type InboxRow,
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

  describe('portal session-list parity', () => {
    const identity = { key: 'u:org', label: 'Acme', logo: 'org-logo', orgId: 'org-1' };
    const rowOf = (raw: Record<string, unknown>): InboxRow => conversationToRow(raw, identity)!;

    it('carries the region flags the session list renders', () => {
      const row = rowOf({
        conversationId: 'c1',
        agentId: 'ag1',
        agentName: 'Rune',
        generationInProgress: true,
        activeSubAgentCount: 2,
        subagentCount: 3,
        backgroundSubAgentCompleted: true,
        contactStatus: 'disabled',
        scope: 'global',
        oneLineSummary: 'Ready when you are',
      });
      expect(row.streaming).toBe(true);
      expect(row.activeSubAgentCount).toBe(2);
      expect(row.subagentCount).toBe(3);
      expect(row.backgroundSubAgentCompleted).toBe(true);
      expect(row.contactStatus).toBe('disabled');
      expect(row.scope).toBe('global');
      expect(row.agentName).toBe('Rune');
      // Portal rule: the avatar initials follow the agent, never the title.
      expect(row.avatarName).toBe('Rune');
    });

    it('lists the child rows a parent should nest', () => {
      const parent = rowOf({ conversationId: 'p1', agentId: 'ag1', updatedAt: '2026-01-01T00:00:00Z' });
      const running = rowOf({
        conversationId: 'k1',
        parentConversationId: 'p1',
        conversationRole: 'subagent',
        isStreaming: true,
        updatedAt: '2026-01-02T00:00:00Z',
      });
      const quiet = rowOf({
        conversationId: 'k2',
        parentConversationId: 'p1',
        conversationRole: 'subagent',
        updatedAt: '2026-01-03T00:00:00Z',
      });
      const done = rowOf({
        conversationId: 'k3',
        parentConversationId: 'p1',
        conversationRole: 'agent_run',
        unreadCount: 1,
        updatedAt: '2026-01-04T00:00:00Z',
      });
      const all = [parent, running, quiet, done];
      expect(nestedSubagentsFor(parent, all).map((r) => r.conversationId)).toEqual(['k1', 'k3']);
      // A focused parent hides completed children (they are what the user sees).
      expect(nestedSubagentsFor(parent, all, { parentFocused: true }).map((r) => r.conversationId)).toEqual(['k1']);
      // The open child always stays, even with nothing else to show.
      expect(
        nestedSubagentsFor(parent, all, { parentFocused: true, activeRowId: quiet.id }).map((r) => r.conversationId),
      ).toEqual(['k1', 'k2']);
    });

    it('nests children under a present parent and keeps orphan running rows', () => {
      const parent = rowOf({ conversationId: 'p1', agentId: 'ag1' });
      const nestedChild = rowOf({ conversationId: 'k1', parentConversationId: 'p1' });
      const orphanRunning = rowOf({ conversationId: 'k2', parentConversationId: 'gone', isStreaming: true });
      const orphanIdle = rowOf({ conversationId: 'k3', parentConversationId: 'gone' });
      const { parents, children } = partitionSubagentRows([parent, nestedChild, orphanRunning, orphanIdle]);
      expect(parents.map((r) => r.conversationId)).toEqual(['p1']);
      expect(children.map((r) => r.conversationId)).toEqual(['k2']);
    });

    it('collapses to the latest conversation per contact, keeping pinned and active', () => {
      const older = rowOf({ conversationId: 'c1', contactId: 'x', updatedAt: '2026-01-01T00:00:00Z' });
      const newer = rowOf({ conversationId: 'c2', contactId: 'x', updatedAt: '2026-03-01T00:00:00Z' });
      const pinnedOld = rowOf({ conversationId: 'c3', contactId: 'y', pinned: true, updatedAt: '2026-01-01T00:00:00Z' });
      const pinnedNew = rowOf({ conversationId: 'c4', contactId: 'y', updatedAt: '2026-02-01T00:00:00Z' });
      const room = rowOf({ conversationId: 'c5', type: 'group', updatedAt: '2026-01-01T00:00:00Z' });
      const latest = latestInboxPerContact([older, newer, pinnedOld, pinnedNew, room]);
      expect(latest.map((r) => r.conversationId)).toEqual(['c2', 'c3', 'c4', 'c5']);
      // The open thread survives even when it is not the newest for its contact.
      const withActive = latestInboxPerContact([older, newer], { isActive: (r) => r.conversationId === 'c1' });
      expect(withActive.map((r) => r.conversationId)).toEqual(['c1', 'c2']);
    });

    it('maps presence from the agent status, asset state, and connection', () => {
      const base = { contactStatus: null, assetPresence: null } as Pick<InboxRow, 'contactStatus' | 'assetPresence'>;
      expect(inboxPresenceStatus(base, 'connected')).toBe('online');
      expect(inboxPresenceStatus(base, 'connecting')).toBe('connecting');
      expect(inboxPresenceStatus(base, 'error')).toBe('error');
      expect(inboxPresenceStatus(base, 'disconnected')).toBe('offline');
      expect(inboxPresenceStatus({ ...base, contactStatus: 'disabled' }, 'connected')).toBe('disabled');
      expect(inboxPresenceStatus({ ...base, assetPresence: 'edge-online' }, 'disconnected')).toBe('edge-online');
      expect(inboxPresenceTitle('registry-offline-edge-online')).toBe('Registry offline, edge online');
      expect(inboxPresenceTitle('offline')).toBe('Realtime offline');
    });

    describe('inboxPresenceStatus semantics', () => {
      const row = (over: Partial<InboxRow> = {}) =>
        ({ contactStatus: null, assetPresence: null, ...over }) as Pick<
          InboxRow,
          'contactStatus' | 'assetPresence'
        >;

      it('renders disabled for an owner-disabled agent even when connected', () => {
        expect(inboxPresenceStatus(row({ contactStatus: 'disabled' }), 'connected')).toBe('disabled');
        expect(inboxPresenceStatus(row({ contactStatus: 'disabled' }), 'disconnected')).toBe('disabled');
      });

      it('passes asset presence through untouched', () => {
        expect(inboxPresenceStatus(row({ assetPresence: 'edge-online' }), 'disconnected')).toBe('edge-online');
        expect(inboxPresenceStatus(row({ assetPresence: 'both-offline' }), 'connected')).toBe('both-offline');
        expect(inboxPresenceStatus(row({ assetPresence: 'registry-offline-edge-online' }), 'error')).toBe(
          'registry-offline-edge-online',
        );
      });

      it('reports online when the activity channel is connected', () => {
        expect(inboxPresenceStatus(row(), 'connected')).toBe('online');
      });

      it('reports online for the derived SessionListPresence value the host passes', () => {
        // `useOutgoingQueue` returns `sessionListPresence(...)`, i.e. `online`,
        // not the raw `ActivityConnectionStatus` `connected`. Matching only the
        // raw vocabulary painted every row gray while the socket was live.
        expect(inboxPresenceStatus(row(), 'online')).toBe('online');
      });

      it('treats an available contact as online even with a disconnected activity channel', () => {
        // Chosen semantics: the region list already says the agent is
        // reachable, and the shared activity socket is best-effort (a host that
        // never opened it, or one whose socket dropped, must not gray a live
        // agent). `available` therefore outranks `disconnected`.
        expect(inboxPresenceStatus(row({ contactStatus: 'available' }), 'disconnected')).toBe('online');
        expect(inboxPresenceStatus(row({ contactStatus: 'available' }), 'connecting')).toBe('online');
        expect(inboxPresenceStatus(row({ contactStatus: 'available' }), 'error')).toBe('online');
        // ...but a disabled agent still wins over `available`.
        expect(inboxPresenceStatus(row({ contactStatus: 'disabled' }), 'disconnected')).toBe('disabled');
      });

      it('falls back to the connection state for a contact with no status', () => {
        expect(inboxPresenceStatus(row({ contactStatus: 'away' }), 'connecting')).toBe('connecting');
        expect(inboxPresenceStatus(row({ contactStatus: 'away' }), 'error')).toBe('error');
        expect(inboxPresenceStatus(row({ contactStatus: 'away' }), 'disconnected')).toBe('offline');
      });
    });

    it('derives the ownership badge from the agent scope and org, not the identity', () => {
      const platform = rowOf({ conversationId: 'c1', agentId: 'a', scope: 'global' });
      expect(inboxScopeBadge(platform)?.tone).toBe('platform');
      // The listing identity is an org, but this agent has no org of its own.
      const priv = rowOf({ conversationId: 'c2', agentId: 'a' });
      expect(priv.identityOrgId).toBe('org-1');
      expect(priv.orgId).toBeNull();
      expect(inboxScopeBadge(priv)?.tone).toBe('private');
      const orgRow = rowOf({ conversationId: 'c3', agentId: 'a', orgId: 'org-9' });
      expect(inboxScopeBadge(orgRow, 'Blue Axion')?.text).toBe('Blue Axion');
      expect(inboxScopeBadge({ ...orgRow, kind: 'human' })).toBeNull();
    });

    it('picks the org logo for a business identity, the avatar for a private one', () => {
      expect(identityRowLogo({ orgId: 'org-1', orgLogo: 'logo.png', avatarUrl: 'me.png' })).toBe('logo.png');
      expect(identityRowLogo({ orgId: null, orgLogo: 'logo.png', avatarUrl: 'me.png' })).toBe('me.png');
    });

    it('flags subagent rows by role or parent link', () => {
      expect(isSubagentRow({ parentConversationId: null, conversationRole: 'subagent' })).toBe(true);
      expect(isSubagentRow({ parentConversationId: 'p', conversationRole: null })).toBe(true);
      expect(isSubagentRow({ parentConversationId: null, conversationRole: 'primary' })).toBe(false);
    });

    it('loads the archived list when asked', async () => {
      const calls: Array<Record<string, unknown> | undefined> = [];
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
        status: 'archived',
        send: async (_identity, _command, payload) => {
          calls.push(payload);
          return { ok: true, data: { conversations: [] } };
        },
      });
      expect(calls[0]?.status).toBe('archived');
      expect(loaded.rows).toEqual([]);
    });
  });

  describe('single-identity adapter', () => {
    it('projects plain conversation rows onto sidebar rows', () => {
      const rows = inboxRowsFromConversationRows(
        [
          { conversationId: 'c1', agentName: 'Ada', agentId: 'ag1', lastActivityAt: '2026-01-02T00:00:00.000Z' },
          { conversationId: 'c2', title: 'Team room', kind: 'group', lastActivityAt: '2026-03-02T00:00:00.000Z' },
        ],
        [{ id: 'ag1', avatarUrl: 'ada.png' }],
      );
      // Sorted newest first, and the contact picture wins over the row picture.
      expect(rows.map((row) => row.conversationId)).toEqual(['c2', 'c1']);
      const ada = rows.find((row) => row.conversationId === 'c1')!;
      expect(ada.identityKey).toBe(SINGLE_IDENTITY_KEY);
      expect(ada.kind).toBe('agent');
      expect(ada.title).toBe('Ada');
      expect(ada.avatarUrl).toBe('ada.png');
      expect(rows.find((row) => row.conversationId === 'c2')!.kind).toBe('group');
    });

    it('skips rows without a conversation id and tolerates no contacts', () => {
      expect(inboxRowsFromConversationRows([{ title: 'no id' }])).toEqual([]);
      const rows = inboxRowsFromConversationRows([{ id: 'c9', title: 'Solo' }]);
      expect(rows).toHaveLength(1);
      expect(rows[0].identityLabel).toBe('');
    });
  });
});
