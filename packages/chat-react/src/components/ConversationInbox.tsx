import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatIdentitySession } from '../bridge/host-bridge.js';
import { conversationHighlightsAgent } from '@nexus/chat-core';
import {
  conversationInitials,
  inboxPresenceStatus,
  inboxPresenceTitle,
  inboxScopeBadge,
  identityNeedsSignIn,
  identityStatusOf,
  isSubagentRow,
  latestInboxPerContact,
  matchesKindFilter,
  nestedSubagentsFor,
  partitionSubagentRows,
  type IdentityStatus,
  type InboxRow,
  type KindFilter,
} from '../inbox/inboxRows.js';
import { CachedAvatarImage } from './CachedAvatarImage.js';
import {
  ROW_ACTION_LABELS,
  rowActionsFor,
  type InboxRowAction,
} from '../inbox/rowActions.js';
import {
  IconArchive,
  IconFilter,
  IconKebab,
  IconPlus,
  IconSearch,
} from './icons.js';

const FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'humans', label: 'Humans' },
  { id: 'agents', label: 'Agents' },
  { id: 'groups', label: 'Groups' },
  { id: 'pinned', label: 'Pinned' },
];

/** New-conversation menu entries, mirroring the portal's `new-*` events. */
export type NewConversationKind = 'new-agent' | 'new-dm' | 'new-group';

// Re-exported so existing consumers can keep importing the action type from here.
export type { InboxRowAction } from '../inbox/rowActions.js';

/** Logo shown on an identity chip: org logo for a business identity, avatar for a private one. */
function identityChipLogo(identity: ChatIdentitySession): string | null {
  const src = identity.orgId ? identity.orgLogo : identity.avatarUrl;
  return typeof src === 'string' && src.trim() ? src : null;
}

/**
 * Identity chip title: the org/person label, with a sign-in hint on expiry
 * (portal `identityButtonTitle`).
 */
function identityButtonTitle(identity: ChatIdentitySession, hidden: boolean, status: IdentityStatus): string {
  const name = identity.label || (identity.orgId ? 'Organization' : 'Private');
  if (identityNeedsSignIn(status)) return `${name} · sign in again`;
  return hidden ? `${name} · hidden` : name;
}

export type ConversationInboxProps = {
  identities: ChatIdentitySession[];
  hiddenKeys: string[];
  /** Per-identity sign-in health keyed by identity key (portal `identityStatus`). */
  identityStatus?: Record<string, IdentityStatus> | null;
  rows: InboxRow[];
  loading: boolean;
  error: string | null;
  activeRowId: string | null;
  highlightAgentId?: string | null;
  /**
   * Conversation ids with a tool run awaiting approval (portal `Approval` badge).
   * Conversation-scoped only — never fanned out to every row of an agent.
   */
  pendingApprovalConversationIds?: string[] | null;
  onToggleIdentity: (key: string) => void;
  onOpen: (row: InboxRow) => void;
  onRetry: () => void;
  /** Shared activity WebSocket health, so rows can show a presence dot. */
  activityConnectionStatus?: string;
  /** Open the archived list (portal `open-archived`). */
  onOpenArchived?: () => void;
  /** True while the archived list is showing, so the link reads as active. */
  archivedActive?: boolean;
  /** Start a new conversation (portal `new-agent` / `new-dm` / `new-group`). */
  onNewConversation?: (kind: NewConversationKind) => void;
  /** Rename / archive / delete / reset / leave a row. */
  onRowAction?: (action: InboxRowAction, row: InboxRow) => void;
};

const LATEST_ONLY_KEY = 'anx-chat-session-list:latest-only';

/** Persisted "latest per contact" preference; storage failures never throw. */
function readLatestOnly(fallback = false): boolean {
  try {
    const raw = localStorage.getItem(LATEST_ONLY_KEY);
    return raw == null ? fallback : raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

function writeLatestOnly(value: boolean): void {
  try {
    localStorage.setItem(LATEST_ONLY_KEY, value ? '1' : '0');
  } catch {
    /* private mode / storage disabled */
  }
}

/**
 * Portal-parity conversation list: toolbar (search + filter + new), identity
 * chips, Archive | Latest quickbar, and stacked rows with owner logo, presence
 * dot, AI/group badge, subtitle, subagent nest, unread pill, and a kebab menu.
 */
export function ConversationInbox(props: ConversationInboxProps) {
  const [filter, setFilter] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [latestOnly, setLatestOnly] = useState(() => readLatestOnly(false));
  const [expandedNests, setExpandedNests] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ row: InboxRow; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const visibleIdentities = props.identities.filter((row) => !props.hiddenKeys.includes(row.key));
  const showOwner = visibleIdentities.length > 1;
  const approvalConversationIds = useMemo(
    () => new Set(props.pendingApprovalConversationIds || []),
    [props.pendingApprovalConversationIds],
  );
  const orgNameOf = (orgId: string | null): string | null => {
    if (!orgId) return null;
    const hit = props.identities.find((item) => item.orgId === orgId);
    return hit?.label || null;
  };

  const activeFilterLabel = useMemo(() => {
    const hit = FILTERS.find((item) => item.id === filter);
    return hit ? `Filter: ${hit.label}` : 'Filter';
  }, [filter]);

  const { rows, nestedByParent } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const { parents, children } = partitionSubagentRows(props.rows);
    const nested = new Map<string, InboxRow[]>();
    for (const parent of parents) {
      const kids = nestedSubagentsFor(parent, props.rows, {
        parentFocused: parent.id === props.activeRowId,
        activeRowId: props.activeRowId,
      });
      if (kids.length) nested.set(parent.conversationId, kids);
    }
    let list = [...parents, ...children]
      .filter((row) => matchesKindFilter(row, filter))
      .filter((row) => {
        if (!q) return true;
        const hay = `${row.title} ${row.summary} ${row.agentName || ''}`.toLowerCase();
        if (hay.includes(q)) return true;
        if (isSubagentRow(row)) return false;
        return (nested.get(row.conversationId) || []).some((kid) =>
          `${kid.title} ${kid.summary}`.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (latestOnly) {
      list = latestInboxPerContact(list, { isActive: (row) => row.id === props.activeRowId });
    }
    return { rows: list, nestedByParent: nested };
  }, [props.rows, props.activeRowId, filter, query, latestOnly]);

  const closeMenus = () => {
    setFilterMenuOpen(false);
    setNewMenuOpen(false);
    setMenu(null);
  };

  // Pointer-outside closes the dropdowns and collapses any open subagent nest,
  // matching the portal's document listener.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const el = rootRef.current;
      if (el && event.target instanceof Node && el.contains(event.target)) return;
      closeMenus();
      setExpandedNests((prev) => (Object.values(prev).some(Boolean) ? {} : prev));
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const toggleLatestOnly = () => {
    setLatestOnly((prev) => {
      writeLatestOnly(!prev);
      return !prev;
    });
  };

  const openMenu = (row: InboxRow, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setFilterMenuOpen(false);
    setNewMenuOpen(false);
    setMenu({ row, x: event.clientX || 0, y: event.clientY || 0 });
  };

  return (
    <div className="nexus-chat__inbox" ref={rootRef}>
      <div className="nexus-chat__session-toolbar" role="toolbar" aria-label="Conversations">
        <label className="nexus-chat__session-search">
          <span className="nexus-chat__sr">Search conversations</span>
          <IconSearch className="nexus-chat__session-search-icon" size={14} />
          <input
            value={query}
            type="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            aria-label="Search conversations"
          />
        </label>
        <div className="nexus-chat__session-menu">
          <button
            type="button"
            className={`nexus-chat__session-icon-btn${filterMenuOpen || filter !== 'all' ? ' is-active' : ''}`}
            title={activeFilterLabel}
            aria-label={activeFilterLabel}
            aria-haspopup="listbox"
            aria-expanded={filterMenuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setNewMenuOpen(false);
              setFilterMenuOpen((open) => !open);
            }}
          >
            <IconFilter size={14} />
          </button>
          {filterMenuOpen ? (
            <ul className="nexus-chat__session-dropdown" role="listbox" aria-label="Filter conversations">
              {FILTERS.map((item) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={filter === item.id}
                  className={`nexus-chat__session-dropdown-item${filter === item.id ? ' is-active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFilter(item.id);
                    setFilterMenuOpen(false);
                  }}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="nexus-chat__session-menu">
          <button
            type="button"
            className="nexus-chat__session-icon-btn nexus-chat__session-icon-btn--primary"
            title="New conversation"
            aria-label="New conversation"
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setFilterMenuOpen(false);
              setNewMenuOpen((open) => !open);
            }}
          >
            <IconPlus size={15} />
          </button>
          {newMenuOpen ? (
            <ul
              className="nexus-chat__session-dropdown nexus-chat__session-dropdown--end"
              role="menu"
              aria-label="New conversation"
            >
              <li
                role="menuitem"
                className="nexus-chat__session-dropdown-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setNewMenuOpen(false);
                  props.onNewConversation?.('new-agent');
                }}
              >
                Message agent
              </li>
              <li
                role="menuitem"
                className="nexus-chat__session-dropdown-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setNewMenuOpen(false);
                  props.onNewConversation?.('new-dm');
                }}
              >
                Direct message
              </li>
              <li
                role="menuitem"
                className="nexus-chat__session-dropdown-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setNewMenuOpen(false);
                  props.onNewConversation?.('new-group');
                }}
              >
                New group
              </li>
            </ul>
          ) : null}
        </div>
      </div>

      {props.identities.length > 1 ? (
        <div className="nexus-chat__identity-row" role="toolbar" aria-label="Identities">
          {props.identities.map((identity) => {
            const hidden = props.hiddenKeys.includes(identity.key);
            const status = identityStatusOf(identity, props.identityStatus);
            const signIn = identityNeedsSignIn(status);
            const src = identityChipLogo(identity);
            return (
              <button
                key={identity.key}
                type="button"
                className={`nexus-chat__identity-chip${identity.orgId ? '' : ' nexus-chat__identity-chip--private'}${hidden ? ' is-hidden' : ''}${signIn ? ' is-error' : ''}`}
                title={identityButtonTitle(identity, hidden, status)}
                aria-label={identityButtonTitle(identity, hidden, status)}
                aria-pressed={!hidden}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggleIdentity(identity.key);
                }}
              >
                {src ? (
                  <CachedAvatarImage
                    src={src}
                    alt=""
                    className="nexus-chat__identity-logo"
                    fallback={
                      <span className="nexus-chat__identity-initials">
                        {conversationInitials(identity.label)}
                      </span>
                    }
                  />
                ) : (
                  <span className="nexus-chat__identity-logo">
                    <span className="nexus-chat__identity-initials">
                      {conversationInitials(identity.label)}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="nexus-chat__session-quickbar">
        <button
          type="button"
          className={`nexus-chat__session-archive${props.archivedActive ? ' is-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenArchived?.();
          }}
        >
          <IconArchive size={12} />
          <span>Archive</span>
        </button>
        <button
          type="button"
          className={`nexus-chat__session-latest${latestOnly ? ' is-active' : ''}`}
          aria-pressed={latestOnly}
          title={
            latestOnly
              ? 'Showing the latest conversation per contact'
              : 'Showing all conversations'
          }
          onClick={(event) => {
            event.stopPropagation();
            toggleLatestOnly();
          }}
        >
          Latest
        </button>
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
        {rows.map((row) => {
          const highlighted = conversationHighlightsAgent(row, props.highlightAgentId);
          const badge = inboxScopeBadge(row, orgNameOf(row.orgId));
          const presence = inboxPresenceStatus(row, props.activityConnectionStatus || 'disconnected');
          const nest = nestedByParent.get(row.conversationId) || [];
          const nestOpen = Boolean(expandedNests[row.conversationId]);
          const liveKids = nest.filter((kid) => kid.streaming).length;
          return (
            <div
              key={row.id}
              role="listitem"
              className={`nexus-chat__session-row${props.activeRowId === row.id ? ' is-active' : ''}${
                highlighted ? ' nexus-chat__session-row--highlight' : ''
              }${nestOpen ? ' is-nest-open' : ''}`}
              aria-current={highlighted ? 'true' : undefined}
              onClick={() => props.onOpen(row)}
              onContextMenu={(event) => openMenu(row, event)}
            >
              <span className="nexus-chat__session-stack">
                {showOwner && row.identityLogo ? (
                  <CachedAvatarImage
                    src={row.identityLogo}
                    alt=""
                    className="nexus-chat__session-owner"
                    fallback=""
                  />
                ) : null}
                <span className="nexus-chat__session-avatar">
                  <span className="nexus-chat__session-face">
                    {row.avatarUrl ? (
                      <CachedAvatarImage
                        src={row.avatarUrl}
                        alt=""
                        fallback={conversationInitials(row.avatarName || row.title)}
                      />
                    ) : (
                      <span className="nexus-chat__session-initials">
                        {conversationInitials(row.avatarName || row.title)}
                      </span>
                    )}
                  </span>
                  <span
                    className={`nexus-chat__session-presence is-${presence}`}
                    title={inboxPresenceTitle(presence)}
                    aria-hidden="true"
                  />
                  {row.kind === 'agent' ? (
                    <span className="nexus-chat__session-overlay nexus-chat__session-overlay--ai">AI</span>
                  ) : row.kind === 'group' || row.kind === 'room' ? (
                    <span className="nexus-chat__session-overlay nexus-chat__session-overlay--group">G</span>
                  ) : null}
                </span>
              </span>
              <span className="nexus-chat__session-body">
                <span className="nexus-chat__session-top">
                  <span className="nexus-chat__session-title">{row.title}</span>
                  {approvalConversationIds.has(row.conversationId) ? (
                    <span
                      className="nexus-chat__session-badge nexus-chat__session-badge--approval"
                      title="Tool run awaiting approval"
                    >
                      Approval
                    </span>
                  ) : null}
                  {row.streaming ? (
                    <span
                      className="nexus-chat__session-badge nexus-chat__session-badge--streaming"
                      title="Generating"
                    >
                      …
                    </span>
                  ) : null}
                  {row.backgroundSubAgentCompleted && !nest.length ? (
                    <span
                      className="nexus-chat__session-badge nexus-chat__session-badge--done"
                      title="Background subagent finished"
                    >
                      Done
                    </span>
                  ) : null}
                  {row.unreadCount > 0 ? (
                    <span className="nexus-chat__session-unread">{row.unreadCount}</span>
                  ) : null}
                </span>
                {nest.length || row.activeSubAgentCount || row.summary || badge ? (
                  <span className="nexus-chat__session-subtitle">
                    {nest.length ? (
                      <button
                        type="button"
                        className={`nexus-chat__session-nest-toggle${liveKids ? ' is-live' : ''}${nestOpen ? ' is-open' : ''}`}
                        aria-expanded={nestOpen}
                        title={
                          liveKids
                            ? `${liveKids} running · click to ${nestOpen ? 'collapse' : 'expand'}`
                            : `Subagents · click to ${nestOpen ? 'collapse' : 'expand'}`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedNests((prev) => (prev[row.conversationId] ? {} : { [row.conversationId]: true }));
                        }}
                      >
                        {liveKids ? <span className="nexus-chat__session-pulse" aria-hidden="true" /> : null}
                        <span className="nexus-chat__session-nest-label">
                          {liveKids && liveKids === nest.length
                            ? liveKids === 1
                              ? '1 subagent'
                              : `${liveKids} subagents`
                            : liveKids
                              ? `${liveKids}/${nest.length} subagents`
                              : nest.length === 1
                                ? '1 subagent'
                                : `${nest.length} subagents`}
                        </span>
                        <span className="nexus-chat__session-nest-chev" aria-hidden="true">
                          {nestOpen ? '▾' : '▸'}
                        </span>
                      </button>
                    ) : row.activeSubAgentCount ? (
                      <span className="nexus-chat__session-nest-toggle is-live">
                        <span className="nexus-chat__session-pulse" aria-hidden="true" />
                        <span className="nexus-chat__session-nest-label">
                          {row.activeSubAgentCount === 1
                            ? '1 subagent'
                            : `${row.activeSubAgentCount} subagents`}
                        </span>
                      </span>
                    ) : row.summary ? (
                      <span className="nexus-chat__session-subtitle-text">{row.summary}</span>
                    ) : null}
                    {badge && !nest.length && !row.activeSubAgentCount ? (
                      <span className={`nexus-chat__session-badge nexus-chat__session-badge--${badge.tone}`}>
                        {badge.text}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {nestOpen && nest.length ? (
                  <span className="nexus-chat__session-nest" role="list" onClick={(event) => event.stopPropagation()}>
                    {nest.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        role="listitem"
                        className={`nexus-chat__session-nest-item${child.id === props.activeRowId ? ' is-active' : ''}${
                          child.streaming ? ' is-live' : ''
                        }`}
                        title={child.title}
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onOpen(child);
                        }}
                      >
                        <span
                          className={`nexus-chat__session-nest-dot${child.streaming ? ' is-live' : ' is-done'}`}
                          aria-hidden="true"
                        />
                        <span className="nexus-chat__session-nest-name">{child.title}</span>
                        {child.streaming ? (
                          <span className="nexus-chat__session-nest-meta">live</span>
                        ) : child.unreadCount ? (
                          <span className="nexus-chat__session-nest-meta is-unread">{child.unreadCount}</span>
                        ) : null}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="nexus-chat__session-kebab"
                title="Actions"
                aria-label={`Actions for ${row.title}`}
                onClick={(event) => openMenu(row, event)}
              >
                <IconKebab size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {menu ? (
        <div
          className="nexus-chat__session-menu-root"
          role="presentation"
          onClick={() => setMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu(null);
          }}
        >
          <ul
            className="nexus-chat__session-context"
            role="menu"
            style={{ top: menu.y, left: menu.x }}
          >
            {rowActionsFor(menu.row).map((action) => (
              <li
                key={action}
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenu(null);
                  props.onRowAction?.(action, menu.row);
                }}
              >
                {ROW_ACTION_LABELS[action]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
