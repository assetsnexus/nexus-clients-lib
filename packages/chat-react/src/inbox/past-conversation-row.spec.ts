import { describe, expect, it } from 'vitest';
import { formatPastConversationTime, pastConversationViews } from './past-conversation-row.js';

const now = new Date('2026-10-15T12:00:00.000Z');

describe('past conversation rows', () => {
  it('shows a title and the last-message time, newest first', () => {
    const views = pastConversationViews(
      [
        {
          conversationId: 'old',
          title: 'Launch plan',
          oneLineSummary: 'Need a date',
          lastMessageAt: '2026-10-14T09:00:00.000Z',
          agentName: 'Chi',
        },
        {
          conversationId: 'new',
          title: 'Budget',
          lastMessageAt: '2026-10-15T11:30:00.000Z',
          agentName: 'Chi',
        },
      ],
      now,
      'en',
    );
    expect(views.map((row) => row.title)).toEqual(['Budget', 'Launch plan']);
    expect(views[1]?.summary).toBe('Need a date');
    expect(views[0]?.timeLabel).not.toBe('');
    expect(views[1]?.timeLabel.toLowerCase()).toContain('yesterday');
  });

  it('does not use the agent name as a title', () => {
    const views = pastConversationViews(
      [{ conversationId: 'bare', agentName: 'Chi', lastMessagePreview: 'Hello there', updatedAt: '2026-10-15T08:00:00.000Z' }],
      now,
      'en',
    );
    expect(views[0]?.title).toBe('Hello there');
    expect(views[0]?.summary).toBe('');
  });

  it('formats a same-day time and an older date', () => {
    expect(formatPastConversationTime('2026-10-15T11:05:00.000Z', now, 'en-GB')).toMatch(/\d/);
    expect(formatPastConversationTime('2025-03-02T11:05:00.000Z', now, 'en-GB')).toMatch(/2025/);
  });
});
