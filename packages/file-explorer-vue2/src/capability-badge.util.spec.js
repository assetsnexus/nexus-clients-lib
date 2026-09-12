import { describe, expect, it } from 'vitest';
import { explorerBadgeLabel } from './capability-badge.util.js';

describe('explorerBadgeLabel', () => {
  it('marks data-room reverse links', () => {
    expect(explorerBadgeLabel({ viaDataRoomId: 'dr1', label: 'a' })).toBe('In data room');
  });
  it('marks provider limits first', () => {
    expect(explorerBadgeLabel({ source: 'external_bucket', viaDataRoomId: 'dr1' })).toBe('Provider-limited');
  });
});
