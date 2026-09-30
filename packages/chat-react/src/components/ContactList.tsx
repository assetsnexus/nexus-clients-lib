import { useRef } from 'react';
import type { ChatContact, ConversationRow, NexusChat } from '@nexus/chat-core';
import type { ChatSlots } from '../slots.js';
import { sortContactsForList } from '../utils/sortContacts.js';
import { openContactThread } from '../utils/openContactFlow.js';
import { CachedAvatarImage } from './CachedAvatarImage.js';

export type ContactListProps = {
  chat: NexusChat;
  contacts: ChatContact[];
  conversationRows?: ConversationRow[];
  activeContactId?: string | null;
  slots?: ChatSlots;
  onActionSheet?: (contactId: string) => void;
};

function DefaultRow({
  contact,
  active,
  onOpen,
  onContext,
  onLongPress,
}: {
  contact: ChatContact;
  active: boolean;
  onOpen: () => void;
  onContext: (e: React.MouseEvent) => void;
  onLongPress: () => void;
}) {
  const initial = contact.name?.slice(0, 1)?.toUpperCase() || '?';
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  return (
    <button
      type="button"
      className={`nexus-chat__contact${active ? ' nexus-chat__contact--active' : ''}`}
      onClick={onOpen}
      onContextMenu={onContext}
      onTouchStart={() => {
        clearPress();
        pressTimer.current = setTimeout(onLongPress, 550);
      }}
      onTouchEnd={clearPress}
      onTouchMove={clearPress}
      onTouchCancel={clearPress}
    >
      <div className="nexus-chat__avatar">
        {contact.avatarUrl ? (
          <CachedAvatarImage src={contact.avatarUrl} alt="" fallback={initial} />
        ) : (
          initial
        )}
      </div>
      <div className="nexus-chat__contact-meta">
        <div className="nexus-chat__contact-name">{contact.name}</div>
        <div style={{ fontSize: 12, color: 'var(--nx-chat-muted)' }}>{contact.type}</div>
      </div>
      {(contact.unreadCount || 0) > 0 ? (
        <span className="nexus-chat__badge">{contact.unreadCount}</span>
      ) : null}
    </button>
  );
}

export function ContactList({
  chat,
  contacts,
  conversationRows,
  activeContactId,
  slots,
  onActionSheet,
}: ContactListProps) {
  const sorted = sortContactsForList(contacts, conversationRows);
  const Row = slots?.contactRow;

  const handleOpen = async (contact: ChatContact) => {
    await openContactThread(chat, contact.id, contact);
  };

  return (
    <div className="nexus-chat__list" role="list">
      {sorted.map((contact) => {
        const active = contact.id === activeContactId;
        if (Row) {
          return (
            <div key={contact.id} role="listitem">
              <Row
                contact={contact}
                active={active}
                onOpen={() => void handleOpen(contact)}
              />
            </div>
          );
        }
        return (
          <DefaultRow
            key={contact.id}
            contact={contact}
            active={active}
            onOpen={() => void handleOpen(contact)}
            onContext={(e) => {
              e.preventDefault();
              onActionSheet?.(contact.id);
            }}
            onLongPress={() => onActionSheet?.(contact.id)}
          />
        );
      })}
    </div>
  );
}
