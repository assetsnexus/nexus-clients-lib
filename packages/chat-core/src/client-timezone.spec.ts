import { describe, expect, it, vi, afterEach } from 'vitest';
import { detectClientTimezone } from './client-timezone.js';

describe('detectClientTimezone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the host resolved IANA zone', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Europe/Berlin',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectClientTimezone()).toBe('Europe/Berlin');
  });

  it('trims a padded zone', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: '  America/New_York  ',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectClientTimezone()).toBe('America/New_York');
  });

  it('returns undefined when the runtime reports no zone', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: '',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(detectClientTimezone()).toBeUndefined();
  });

  it('never throws — a hostile runtime degrades to undefined', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
      throw new Error('no zone');
    });
    expect(detectClientTimezone()).toBeUndefined();
  });
});
