import { describe, expect, it } from 'vitest';
import { resolveChatChrome } from './chat-chrome.js';

describe('chat chrome', () => {
  it('hides the contacts sidebar when features.contacts is false', () => {
    const chrome = resolveChatChrome({ contacts: false, groups: true, lockedAgent: null });
    expect(chrome.showContactsSidebar).toBe(false);
    expect(chrome.showContactsTab).toBe(false);
    expect(chrome.showNewDm).toBe(false);
    expect(chrome.showContactSheet).toBe(false);
    expect(chrome.showRoomsTab).toBe(true);
    expect(chrome.showSidebar).toBe(true);
    expect(chrome.conversationList).toBe('sidebar');
    expect(chrome.showConversationDrawer).toBe(false);
  });

  it('hides the whole sidebar when contacts and rooms are off', () => {
    const chrome = resolveChatChrome({ contacts: false, groups: false, lockedAgent: null });
    expect(chrome.showSidebar).toBe(false);
    expect(chrome.showContactsSidebar).toBe(false);
    expect(chrome.showConversationList).toBe(false);
  });

  it('hides contacts, rooms, new DM, and the contact sheet when locked to one agent', () => {
    const chrome = resolveChatChrome({
      contacts: true,
      groups: true,
      lockedAgent: { virtualEmployeeId: 've-locked' },
    });
    expect(chrome).toEqual({
      showContactsSidebar: false,
      showContactsTab: false,
      showRoomsTab: false,
      showNewDm: false,
      showContactSheet: false,
      showSidebar: false,
      conversationList: 'hidden',
      showConversationList: false,
      showConversationDrawer: false,
      highlightAgentId: null,
    });
  });

  it('keeps the full list and marks one agent when the host asks', () => {
    const chrome = resolveChatChrome({
      contacts: true,
      groups: true,
      lockedAgent: null,
      conversationList: 'sidebar',
      highlightAgentId: ' ve-marked ',
    });
    expect(chrome.showSidebar).toBe(true);
    expect(chrome.showRoomsTab).toBe(true);
    expect(chrome.highlightAgentId).toBe('ve-marked');
    expect(chrome.showConversationDrawer).toBe(false);
  });

  it('opens a filtered drawer without the contact directory', () => {
    const chrome = resolveChatChrome({
      contacts: false,
      groups: false,
      lockedAgent: { virtualEmployeeId: 've-locked' },
      conversationList: 'drawer',
    });
    expect(chrome.showSidebar).toBe(false);
    expect(chrome.showNewDm).toBe(false);
    expect(chrome.showConversationDrawer).toBe(true);
    expect(chrome.showConversationList).toBe(true);
  });
});
