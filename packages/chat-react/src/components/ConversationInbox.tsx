import { useMemo, useState } from 'react';
import type { ChatIdentitySession } from '../bridge/host-bridge.js';
import { matchesKindFilter, type InboxRow, type KindFilter } from '../inbox/inboxRows.js';
import { CachedAvatarImage } from './CachedAvatarImage.js';

const FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'humans', label: 'People' },
  { id: 'agents', label: 'Agents' },
  { id: 'groups', label: 'Groups' },
  { id: 'pinned', label: 'Pinned' },
];

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}

export function ConversationInbox(props: {
  identities: ChatIdentitySession[];
  hiddenKeys: string[];
  rows: InboxRow[];
  loading: boolean;
  error: string | null;
  activeRowId: string | null;
  onToggleIdentity: (key: string) => void;
  onOpen: (row: InboxRow) => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const visibleIdentities = props.identities.filter((row) => !props.hiddenKeys.includes(row.key));
  const showOwner = visibleIdentities.length > 1;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.rows.filter((row) => {
      if (!matchesKindFilter(row, filter)) return false;
      if (!q) return true;
      return `${row.title} ${row.summary}`.toLowerCase().includes(q);
    });
  }, [props.rows, filter, query]);

  return (
    <div className="nexus-chat__inbox">
      <label className="nexus-chat__search">
        <span className="nexus-chat__sr">Search conversations</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search conversations"
        />
      </label>
      <div className="nexus-chat__identity-row" role="toolbar" aria-label="Identities">
        {props.identities.map((identity) => {
          const hidden = props.hiddenKeys.includes(identity.key);
          const src = identity.orgLogo || identity.avatarUrl;
          return (
            <button
              key={identity.key}
              type="button"
              className={`nexus-chat__identity-chip${hidden ? ' nexus-chat__identity-chip--off' : ''}`}
              aria-pressed={!hidden}
              aria-label={`${hidden ? 'Show' : 'Hide'} ${identity.label}`}
              onClick={() => props.onToggleIdentity(identity.key)}
            >
              {src ? (
                <CachedAvatarImage src={src} alt="" className="nexus-chat__identity-logo" fallback={initials(identity.label)} />
              ) : (
                <span className="nexus-chat__identity-logo">{initials(identity.label)}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="nexus-chat__kind-row" role="tablist" aria-label="Conversation type">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={`nexus-chat__kind${filter === item.id ? ' nexus-chat__kind--on' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {props.error ? (
        <div className="nexus-chat__banner" role="alert">
          <span>{props.error}</span>
          <button type="button" className="nexus-chat__btn" onClick={props.onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      <div className="nexus-chat__inbox-list" role="list">
        {props.loading && !rows.length
          ? [0, 1, 2, 3].map((i) => <div key={i} className="nexus-chat__skeleton" />)
          : null}
        {!props.loading && !rows.length ? (
          <p className="nexus-chat__empty">No conversations yet. Start a chat with an agent.</p>
        ) : null}
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            role="listitem"
            className={`nexus-chat__inbox-row${props.activeRowId === row.id ? ' nexus-chat__inbox-row--active' : ''}`}
            onClick={() => props.onOpen(row)}
          >
            <span className="nexus-chat__stack">
              {showOwner && row.identityLogo ? (
                <CachedAvatarImage src={row.identityLogo} alt="" className="nexus-chat__owner-mark" fallback="" />
              ) : null}
              {row.avatarUrl ? (
                <CachedAvatarImage src={row.avatarUrl} alt="" className="nexus-chat__peer" fallback={initials(row.title)} />
              ) : (
                <span className="nexus-chat__peer">{initials(row.title)}</span>
              )}
              {row.kind === 'agent' || row.kind === 'group' || row.kind === 'room' ? (
                <span className="nexus-chat__kind-badge">{row.kind === 'agent' ? 'AI' : 'G'}</span>
              ) : null}
            </span>
            <span className="nexus-chat__inbox-copy">
              <span className="nexus-chat__inbox-title">{row.title}</span>
              <span className="nexus-chat__inbox-summary">{row.summary || identityHint(row)}</span>
            </span>
            {row.unreadCount > 0 ? <span className="nexus-chat__unread">{row.unreadCount}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function identityHint(row: InboxRow): string {
  return row.identityLabel;
}
