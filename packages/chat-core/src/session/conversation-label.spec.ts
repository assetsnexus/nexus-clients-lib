import { describe, expect, it } from 'vitest';
import {
  UNTITLED_CONVERSATION_LABEL,
  looksLikeInternalId,
  resolveConversationLabel,
} from './conversation-label.js';

/**
 * The label precedence every adapter shares. The regression under test is the
 * direct user report: a raw internal id (`1792316062792-nm26u6zve`) rendered
 * where a human-readable name belongs.
 */
describe('resolveConversationLabel', () => {
  const CONVERSATION_ID = '1792316062792-nm26u6zve';

  it('prefers the region-resolved displayTitle over everything else', () => {
    expect(
      resolveConversationLabel({
        conversationId: CONVERSATION_ID,
        displayTitle: 'Rune',
        title: 'Project kickoff',
        agentName: 'Xcamp',
        participantNames: ['Veyla'],
      }),
    ).toBe('Rune');
  });

  it('uses the stored title when there is no displayTitle', () => {
    expect(
      resolveConversationLabel({ conversationId: 'c1', title: 'Project kickoff', agentName: 'Xcamp' }),
    ).toBe('Project kickoff');
  });

  it('uses the agent name when there is no stored title', () => {
    // The shape the region returns for most agent DMs: `title: null` + agentName.
    expect(resolveConversationLabel({ conversationId: 'c1', title: null, agentName: 'Xcamp' })).toBe('Xcamp');
  });

  it('falls back to a partner/participant name', () => {
    expect(resolveConversationLabel({ conversationId: 'r1', participantNames: ['Veyla'] })).toBe('Veyla');
    expect(resolveConversationLabel({ conversationId: 'r2', participantLabel: 'Ada' })).toBe('Ada');
  });

  it('falls back to the neutral literal last', () => {
    expect(resolveConversationLabel({ conversationId: 'r3' })).toBe(UNTITLED_CONVERSATION_LABEL);
    expect(resolveConversationLabel(null)).toBe(UNTITLED_CONVERSATION_LABEL);
    expect(resolveConversationLabel({ conversationId: 'r4', title: '   ' })).toBe(UNTITLED_CONVERSATION_LABEL);
  });

  it('NEVER renders a raw conversationId as the label', () => {
    const label = resolveConversationLabel({ conversationId: CONVERSATION_ID });
    expect(label).toBe(UNTITLED_CONVERSATION_LABEL);
    expect(label).not.toBe(CONVERSATION_ID);
    expect(label).not.toContain(CONVERSATION_ID);
  });

  it('skips an internal id that was mistakenly stored as the title', () => {
    // The old Vue 2 panel guarded a UUID here; the shared rule rejects every
    // known internal-id shape (UUID / ObjectId / region `<epoch-ms>-<suffix>`).
    expect(resolveConversationLabel({ conversationId: 'c1', title: '1792316062792-nm26u6zve' })).toBe(
      UNTITLED_CONVERSATION_LABEL,
    );
    expect(
      resolveConversationLabel({ conversationId: 'c1', name: '923a3904-f9a2-46e8-8883-a1a3feef7d49' }),
    ).toBe(UNTITLED_CONVERSATION_LABEL);
  });

  it('skips an id-shaped name but still prefers a real title behind it', () => {
    expect(
      resolveConversationLabel({ conversationId: 'c1', title: '923a3904-f9a2-46e8-8883-a1a3feef7d49', agentName: 'Rune' }),
    ).toBe('Rune');
  });

  it('does not treat a legitimate name that merely contains digits as an id', () => {
    expect(resolveConversationLabel({ conversationId: 'c1', title: 'Team 42' })).toBe('Team 42');
    expect(resolveConversationLabel({ conversationId: 'c1', title: 'Support' })).toBe('Support');
  });
});

describe('looksLikeInternalId', () => {
  it('recognizes uuid, objectId, and region id shapes', () => {
    expect(looksLikeInternalId('1792316062792-nm26u6zve')).toBe(true);
    expect(looksLikeInternalId('923a3904-f9a2-46e8-8883-a1a3feef7d49')).toBe(true);
    expect(looksLikeInternalId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('leaves human names and blank values alone', () => {
    expect(looksLikeInternalId('Rune')).toBe(false);
    expect(looksLikeInternalId('Team 42')).toBe(false);
    expect(looksLikeInternalId('')).toBe(false);
    expect(looksLikeInternalId(null)).toBe(false);
  });
});
