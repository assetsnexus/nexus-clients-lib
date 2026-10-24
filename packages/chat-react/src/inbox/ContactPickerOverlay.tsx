import { useEffect, useMemo, useState } from 'react';
import type { ChatContact } from '@nexus/chat-core';
import {
  dedupePickerContacts,
  filterPickerContacts,
  pickerGroups,
  pickerPool,
  type AgentPickerTab,
  type PickerMode,
} from '../inbox/pickerContacts.js';
import { conversationInitials } from '../inbox/inboxRows.js';
import { CachedAvatarImage } from '../components/CachedAvatarImage.js';

export type ContactPickerSelection = {
  contact: ChatContact;
  /** Optional name typed by the user for the new thread/room. */
  name: string;
  /**
   * Start a brand-new conversation instead of resuming the existing one.
   * DM mode exposes this as an explicit checkbox; agent mode is always new.
   */
  forceNew: boolean;
};

export type ContactPickerOverlayProps = {
  open: boolean;
  mode: PickerMode;
  contacts: ChatContact[];
  /** Offer the optional "name this conversation" field (portal `allow-name`). */
  allowName?: boolean;
  /**
   * Contact ids that already have a conversation the picker can reopen. In DM
   * mode those rows are labelled "Resume" instead of "New", so the user knows
   * selecting keeps their history rather than starting over.
   */
  resumableContactIds?: string[] | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSelect: (selection: ContactPickerSelection) => void;
};

function heading(mode: PickerMode): string {
  return mode === 'agent' ? 'Message agent' : 'Direct message';
}

function searchPlaceholder(mode: PickerMode, tab: AgentPickerTab): string {
  if (mode !== 'agent') return 'Search people…';
  return tab === 'assets' ? 'Search assets…' : 'Search agents and assets…';
}

function emptyText(mode: PickerMode, tab: AgentPickerTab): string {
  if (mode !== 'agent') return 'No people found';
  return tab === 'assets' ? 'No talkable assets' : 'No agents found';
}

/**
 * Portal-parity picker overlay (`ContactPickerOverlay.vue`). Used for both
 * "Message agent" (grouped agents + assets, General/Assets tabs) and
 * "Direct message" (flat people list). Selecting a row emits the contact with
 * the optional thread name so the host can start a NEW conversation
 * (`forceNew` / `conversationId: null` semantics).
 */
export function ContactPickerOverlay(props: ContactPickerOverlayProps) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [tab, setTab] = useState<AgentPickerTab>('general');
  /** DM mode only: ignore an existing thread and mint a fresh one. */
  const [startNew, setStartNew] = useState(false);

  // Reset on open so a second launch never shows the previous query/name.
  useEffect(() => {
    if (!props.open) return;
    setQuery('');
    setName('');
    setTab('general');
    setStartNew(false);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);

  const groups = useMemo(() => {
    const pool = filterPickerContacts(dedupePickerContacts(pickerPool(props.contacts, props.mode)), query);
    return pickerGroups(pool, props.mode, tab);
  }, [props.contacts, props.mode, tab, query]);

  // DM mode always yields one group, so an empty pool must still be detected
  // from the row count — otherwise the list renders blank with no explanation.
  const resultCount = useMemo(
    () => groups.reduce((n, group) => n + group.contacts.length, 0),
    [groups],
  );

  const resumable = useMemo(
    () => new Set((props.resumableContactIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    [props.resumableContactIds],
  );

  if (!props.open) return null;

  return (
    <div className="nexus-chat__picker" role="dialog" aria-modal="true" aria-label={heading(props.mode)}>
      <div className="nexus-chat__picker-backdrop" onClick={props.onClose} />
      <div className="nexus-chat__picker-panel">
        <div className="nexus-chat__picker-head">
          <strong>{heading(props.mode)}</strong>
          <button type="button" className="nexus-chat__picker-close" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="nexus-chat__picker-body">
          {props.allowName ? (
            <label className="nexus-chat__picker-field">
              <span>Name (optional)</span>
              <input
                type="text"
                value={name}
                maxLength={200}
                autoComplete="off"
                placeholder="Name this conversation"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          {props.mode === 'agent' ? (
            <div className="nexus-chat__picker-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'general'}
                className={`nexus-chat__picker-tab${tab === 'general' ? ' is-active' : ''}`}
                onClick={() => setTab('general')}
              >
                General
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'assets'}
                className={`nexus-chat__picker-tab${tab === 'assets' ? ' is-active' : ''}`}
                onClick={() => setTab('assets')}
              >
                Assets
              </button>
            </div>
          ) : null}
          {props.mode === 'dm' ? (
            <label className="nexus-chat__picker-check">
              <input
                type="checkbox"
                checked={startNew}
                onChange={(event) => setStartNew(event.target.checked)}
              />
              <span>Start a new conversation</span>
            </label>
          ) : null}
          <input
            type="search"
            className="nexus-chat__picker-search"
            value={query}
            placeholder={searchPlaceholder(props.mode, tab)}
            aria-label={searchPlaceholder(props.mode, tab)}
            onChange={(event) => setQuery(event.target.value)}
          />
          {props.error ? (
            <p className="nexus-chat__picker-error" role="alert">
              {props.error}
            </p>
          ) : null}
          <ul className="nexus-chat__picker-list" role="listbox">
            {groups.map((group) => (
              <li key={group.id} className="nexus-chat__picker-group">
                {group.label ? (
                  <div className="nexus-chat__picker-group-label">{group.label}</div>
                ) : null}
                <ul className="nexus-chat__picker-group-list">
                  {group.contacts.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        className="nexus-chat__picker-row"
                        disabled={props.saving}
                        onClick={() =>
                          props.onSelect({
                            contact,
                            name: name.trim(),
                            // Agent mode is always a fresh thread; DM mode honors
                            // the "Start a new conversation" checkbox.
                            forceNew: props.mode === 'agent' ? true : startNew,
                          })
                        }
                      >
                        <span className="nexus-chat__picker-avatar">
                          {contact.avatarUrl ? (
                            <CachedAvatarImage
                              src={contact.avatarUrl}
                              alt=""
                              fallback={conversationInitials(contact.name)}
                            />
                          ) : (
                            conversationInitials(contact.name)
                          )}
                        </span>
                        <span className="nexus-chat__picker-name">{contact.name}</span>
                        {props.mode === 'dm' && resumable.has(String(contact.id || '').trim()) ? (
                          <span className="nexus-chat__picker-tag">Resume</span>
                        ) : null}
                        {contact.type === 'asset_agent' ? (
                          <span className="nexus-chat__picker-tag">Asset</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {!resultCount ? (
              <li className="nexus-chat__picker-empty">{emptyText(props.mode, tab)}</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
