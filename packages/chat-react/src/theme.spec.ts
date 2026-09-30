import { describe, expect, it } from 'vitest';
import { buildContactThreadIndex } from '@nexus/chat-core';
import { DEFAULT_THEME, themeToCssVars } from './theme.js';

describe('themeToCssVars', () => {
  it('maps theme fields to CSS custom properties', () => {
    const vars = themeToCssVars({ colorAccent: '#ff0000', density: 'compact' });
    expect(vars['--nx-chat-accent']).toBe('#ff0000');
    expect(vars['--nx-chat-bg']).toBe(DEFAULT_THEME.colorBg);
    expect(vars['--nx-chat-gap']).toBe('6px');
  });

  it('uses comfortable spacing by default', () => {
    const vars = themeToCssVars({});
    expect(vars['--nx-chat-gap']).toBe('10px');
  });

  it('sorts contacts via buildContactThreadIndex when rows exist', () => {
    const index = buildContactThreadIndex(
      [
        { id: 'a', name: 'Alpha', type: 'agent' },
        { id: 'b', name: 'Beta', type: 'user' },
      ],
      [
        {
          conversationId: 'c1',
          agentId: 'b',
          lastActivityAt: '2026-02-01T00:00:00Z',
          hasMessages: true,
        },
      ],
    );
    expect(index[0]?.contactId).toBe('b');
  });
});
