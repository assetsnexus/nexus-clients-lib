import { describe, expect, it } from 'vitest';
import {
  detectProviderFromUrl,
  isMeetingProviderId,
  normalizeProviderId,
  providerOpens,
  providerSpec,
} from './providers.js';

describe('normalizeProviderId', () => {
  it('maps aliases case-insensitively', () => {
    expect(normalizeProviderId('Zoom')).toBe('zoom');
    expect(normalizeProviderId('MS-Teams')).toBe('teams');
    expect(normalizeProviderId('msteams')).toBe('teams');
    expect(normalizeProviderId('google')).toBe('google_meet');
    expect(normalizeProviderId('meet')).toBe('google_meet');
    expect(normalizeProviderId('cisco')).toBe('webex');
    expect(normalizeProviderId('other')).toBe('custom');
    expect(normalizeProviderId('physical')).toBe('in_person');
  });

  it('returns null for unknown or empty', () => {
    expect(normalizeProviderId('acme')).toBeNull();
    expect(normalizeProviderId('')).toBeNull();
    expect(normalizeProviderId(undefined)).toBeNull();
  });
});

describe('detectProviderFromUrl', () => {
  it('detects each known provider by host', () => {
    expect(detectProviderFromUrl('https://us02web.zoom.us/j/123')).toBe('zoom');
    expect(detectProviderFromUrl('https://teams.microsoft.com/l/meetup-join/x')).toBe('teams');
    expect(detectProviderFromUrl('https://meet.google.com/abc-defg-hij')).toBe('google_meet');
    expect(detectProviderFromUrl('https://acme.webex.com/meet/x')).toBe('webex');
  });

  it('returns custom for an unknown external url, null for junk/empty', () => {
    expect(detectProviderFromUrl('https://example.com/meet')).toBe('custom');
    expect(detectProviderFromUrl('not a url')).toBeNull();
    expect(detectProviderFromUrl('')).toBeNull();
    expect(detectProviderFromUrl(null)).toBeNull();
  });
});

describe('isMeetingProviderId', () => {
  it('recognizes canonical ids only', () => {
    expect(isMeetingProviderId('zoom')).toBe(true);
    expect(isMeetingProviderId('msteams')).toBe(false);
  });
});

describe('providerOpens / providerSpec', () => {
  it('nexus is always clickable, external needs a url, describe is not', () => {
    expect(providerOpens('nexus', null)).toBe(true);
    expect(providerOpens('zoom', null)).toBe(false);
    expect(providerOpens('zoom', 'https://z/x')).toBe(true);
    expect(providerOpens('custom', 'https://x/y')).toBe(false);
    expect(providerOpens('in_person', null)).toBe(false);
  });

  it('exposes capability flags per provider', () => {
    expect(providerSpec('nexus').supportsScene).toBe(true);
    expect(providerSpec('zoom').supportsNativeMedia).toBe(false);
    expect(providerSpec('in_person').openMode).toBe('describe');
  });
});
