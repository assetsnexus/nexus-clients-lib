import {
  buildContactThreadIndex,
  type ChatContact,
  type ConversationRow,
} from '@nexus/chat-core';

export function sortContactsForList(
  contacts: ChatContact[],
  conversationRows?: ConversationRow[],
): ChatContact[] {
  if (conversationRows?.length) {
    const index = buildContactThreadIndex(contacts, conversationRows);
    const order = new Map(index.map((e, i) => [e.contactId, i]));
    return [...contacts].sort(
      (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999),
    );
  }
  return [...contacts].sort((a, b) => {
    const ua = a.unreadCount || 0;
    const ub = b.unreadCount || 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
