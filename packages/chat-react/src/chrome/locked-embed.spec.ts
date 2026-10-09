import { describe, expect, it } from 'vitest';
import { chatFailureInfo, lockedEmbedPresentation } from './locked-embed.js';

describe('locked embed presentation', () => {
  it('titles the locked agent and mounts approval surfaces without a contact picker', () => {
    const view = lockedEmbedPresentation({
      lockedAgent: { virtualEmployeeId: '1791496902072-x3igecefk', displayName: 'Guide' },
      contactName: '1791496902072-x3igecefk',
      contactSelected: true,
    });
    expect(view.title).toBe('Guide');
    expect(view.title).not.toContain('1791496902072');
    expect(view.empty).toBe('Send a message to start.');
    expect(view.mountApprovals).toBe(true);
    expect(view.mountSubagents).toBe(true);
    expect(view.mountGrants).toBe(true);
    expect(view.mountToolTimeline).toBe(true);
    expect(view.avatarUrl).toBeNull();
  });

  it('uses the host avatar and hides Nexus-only surfaces in fallback mode', () => {
    const withHost = lockedEmbedPresentation({
      lockedAgent: {
        virtualEmployeeId: '1791496902072-x3igecefk',
        displayName: 'Guide',
        avatarUrl: 'https://cdn.example/host.png',
      },
      serverAvatarUrl: 'https://cdn.example/server.png',
      contactSelected: true,
      fallback: true,
    });
    expect(withHost.avatarUrl).toBe('https://cdn.example/host.png');
    expect(withHost.title).toBe('Guide');
    expect(withHost.mountApprovals).toBe(false);
    expect(withHost.mountSubagents).toBe(false);
    expect(withHost.mountToolTimeline).toBe(false);
    const serverOnly = lockedEmbedPresentation({
      lockedAgent: { virtualEmployeeId: '1791496902072-x3igecefk', displayName: 'Guide' },
      serverAvatarUrl: 'https://cdn.example/server.png',
      contactSelected: true,
    });
    expect(serverOnly.avatarUrl).toBe('https://cdn.example/server.png');
    const empty = lockedEmbedPresentation({
      lockedAgent: { virtualEmployeeId: '1791496902072-x3igecefk', displayName: 'Guide', avatarUrl: '  ' },
      serverAvatarUrl: '   ',
      contactSelected: true,
    });
    expect(empty.avatarUrl).toBeNull();
  });

  it('keeps the contact picker only when nothing is selected', () => {
    const view = lockedEmbedPresentation({ lockedAgent: null, contactSelected: false });
    expect(view.empty).toBe('Select a contact to start chatting.');
    expect(view.title).toBe('Nexus Chat');
  });

  it('reads a command failure code', () => {
    const error = new Error('Sign in with Nexus to chat.') as Error & { code?: string };
    error.code = 'NO_NEXUS_GRANT';
    expect(chatFailureInfo(error)).toEqual({
      message: 'Sign in with Nexus to chat.',
      code: 'NO_NEXUS_GRANT',
    });
  });
});
