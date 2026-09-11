import { describe, expect, it } from 'vitest';
import { formatTurnSenderLine, formatTurnTime } from './turn-meta.js';

describe('formatTurnTime', () => {
  it('formats today as HH:mm', () => {
    const now = new Date(2026, 8, 11, 16, 42, 0);
    const at = new Date(2026, 8, 11, 9, 5, 0).toISOString();
    expect(formatTurnTime(at, now)).toBe('09:05');
  });

  it('includes short date when not today', () => {
    const now = new Date(2026, 8, 11, 16, 42, 0);
    const at = new Date(2026, 8, 10, 9, 5, 0).toISOString();
    expect(formatTurnTime(at, now)).toBe('10 Sep 09:05');
  });
});

describe('formatTurnSenderLine', () => {
  const now = new Date(2026, 8, 11, 16, 42, 0);

  it('labels viewer as You', () => {
    expect(
      formatTurnSenderLine(
        {
          role: 'user',
          senderId: 'u1',
          createdAt: new Date(2026, 8, 11, 16, 42, 0).toISOString(),
        },
        { viewerUserId: 'u1', now },
      ),
    ).toBe('You · 16:42');
  });

  it('uses localized youLabel when provided', () => {
    expect(
      formatTurnSenderLine(
        {
          role: 'user',
          senderId: 'u1',
          createdAt: new Date(2026, 8, 11, 16, 42, 0).toISOString(),
        },
        { viewerUserId: 'u1', now, youLabel: 'Du' },
      ),
    ).toBe('Du · 16:42');
  });

  it('uses contact name for assistant', () => {
    expect(
      formatTurnSenderLine(
        {
          role: 'assistant',
          createdAt: new Date(2026, 8, 11, 16, 42, 0).toISOString(),
        },
        { contactName: 'Ada', now },
      ),
    ).toBe('Ada · 16:42');
  });

  it('resolves room participant names', () => {
    expect(
      formatTurnSenderLine(
        {
          role: 'user',
          senderId: 'u2',
          createdAt: new Date(2026, 8, 11, 16, 42, 0).toISOString(),
        },
        {
          viewerUserId: 'u1',
          participantNames: { u2: 'Alex' },
          now,
        },
      ),
    ).toBe('Alex · 16:42');
  });
});
