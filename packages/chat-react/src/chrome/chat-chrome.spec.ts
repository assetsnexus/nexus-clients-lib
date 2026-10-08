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
  });

  it('hides the whole sidebar when contacts and rooms are off', () => {
    const chrome = resolveChatChrome({ contacts: false, groups: false, lockedAgent: null });
    expect(chrome.showSidebar).toBe(false);
    expect(chrome.showContactsSidebar).toBe(false);
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
    });
  });
});
