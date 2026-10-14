import {
  parseHighlightAgentId,
  resolveConversationListMode,
  type ConversationListMode,
  type LockedAgent,
} from '@nexus/chat-core';

export type ChatChromeVisibility = {
  /** Contacts tab, contact directory, and identity inbox. */
  showContactsSidebar: boolean;
  showContactsTab: boolean;
  showRoomsTab: boolean;
  /** Opening a directory contact allocates a DM. Hidden with the directory. */
  showNewDm: boolean;
  showContactSheet: boolean;
  /** Whole conversation sidebar (contacts and/or rooms). */
  showSidebar: boolean;
  /** Sidebar, hidden, or a button that opens the same list. */
  conversationList: ConversationListMode;
  /** Load the shared list for the sidebar or the drawer. */
  showConversationList: boolean;
  /** Column layout: the list stays closed until the host button opens it. */
  showConversationDrawer: boolean;
  /** Virtual employee to mark in the full list. Null marks nothing. */
  highlightAgentId: string | null;
};

/**
 * `features.contacts: false` hides the contacts sidebar.
 * `lockedAgent` hides new DMs and the contact sheet.
 * `conversationList` decides whether that lock also hides the list.
 */
export function resolveChatChrome(input: {
  contacts: boolean;
  groups: boolean;
  lockedAgent?: Pick<LockedAgent, 'virtualEmployeeId'> | null;
  conversationList?: ConversationListMode | null;
  highlightAgentId?: string | null;
}): ChatChromeVisibility {
  const locked = Boolean(input.lockedAgent?.virtualEmployeeId?.trim());
  const conversationList = resolveConversationListMode({
    conversationList: input.conversationList,
    lockedAgent: input.lockedAgent,
  });
  const directory = conversationList === 'sidebar';
  const showContacts = input.contacts === true && directory;
  const showRooms = input.groups === true && directory && !locked;
  const showContactsTab = showContacts;
  return {
    showContactsSidebar: showContacts,
    showContactsTab,
    showRoomsTab: showRooms,
    showNewDm: showContacts && !locked,
    showContactSheet: showContacts && !locked,
    showSidebar: showContacts || showRooms,
    conversationList,
    showConversationList: conversationList === 'drawer' || showContacts || showRooms,
    showConversationDrawer: conversationList === 'drawer',
    highlightAgentId: parseHighlightAgentId(input.highlightAgentId),
  };
}
