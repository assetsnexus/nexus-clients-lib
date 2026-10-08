import type { LockedAgent } from '@nexus/chat-core';

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
};

/**
 * `features.contacts: false` hides the contacts sidebar.
 * `lockedAgent` also hides rooms, new DMs, and the contact sheet.
 */
export function resolveChatChrome(input: {
  contacts: boolean;
  groups: boolean;
  lockedAgent?: Pick<LockedAgent, 'virtualEmployeeId'> | null;
}): ChatChromeVisibility {
  const locked = Boolean(input.lockedAgent?.virtualEmployeeId?.trim());
  const showContacts = input.contacts === true && !locked;
  const showRooms = input.groups === true && !locked;
  return {
    showContactsSidebar: showContacts,
    showContactsTab: showContacts,
    showRoomsTab: showRooms,
    showNewDm: showContacts,
    showContactSheet: showContacts,
    showSidebar: showContacts || showRooms,
  };
}
