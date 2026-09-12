import { describe, expect, it } from 'vitest';
import { capabilitiesFromBackend, isImageMime, limitationBadges, nextIfMatchRevision } from './index';

describe('files-core', () => {
  it('capabilities default read+share, opt-in writes', () => {
    expect(capabilitiesFromBackend(undefined)).toEqual({
      read: true,
      partialWrite: false,
      revert: false,
      livePreview: false,
      shareLinks: true,
      pageDwell: false,
    });
    expect(capabilitiesFromBackend({ partialWrite: true, shareLinks: false }).shareLinks).toBe(false);
  });

  it('images for thumbnails', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime(undefined, 'q3.xlsx')).toBe(false);
  });

  it('revision protocol starts at 0', () => {
    expect(nextIfMatchRevision(undefined)).toBe(0);
    expect(nextIfMatchRevision(3)).toBe(3);
  });

  it('external buckets always surface a limitation badge', () => {
    expect(limitationBadges({ source: 'external_bucket' })).toContain('provider_limited');
  });
});
