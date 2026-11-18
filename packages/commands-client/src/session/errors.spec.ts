import { describe, expect, it } from 'vitest';
import { NexusError } from '../errors/nexus-error.js';
import {
  classifyNexusProbe,
  classifyTokenError,
  fallbackSelected,
  nexusErrorMessage,
  nexusGrantRequired,
  nexusOfflineCode,
} from './errors.js';

describe('classifyTokenError', () => {
  it('maps invalid_grant to a re-login hint', () => {
    const err = new NexusError('INVALID_GRANT', 'refresh failed: 400', {
      meta: { status: 400, oauthError: 'invalid_grant' },
    });
    const info = classifyTokenError(err);
    expect(info.code).toBe('INVALID_GRANT');
    expect(info.hint).toContain('Sign in again');
  });

  it('maps invalid_client to a secret hint', () => {
    const err = new NexusError('INVALID_CLIENT', 'refresh failed: 401', {
      meta: { status: 401, oauthError: 'invalid_client' },
    });
    expect(classifyTokenError(err).code).toBe('CLIENT_AUTH_FAILED');
    expect(classifyTokenError(err).hint).toContain('client secret');
  });

  it('maps a 5xx to unavailable', () => {
    const err = new NexusError('UNKNOWN', 'refresh failed: 503', { meta: { status: 503 } });
    expect(classifyTokenError(err).code).toBe('NEXUS_UNAVAILABLE');
  });

  it('maps a fetch failure to unavailable', () => {
    expect(classifyTokenError(new Error('fetch failed')).code).toBe('NEXUS_UNAVAILABLE');
  });

  it('stays unknown for an unrecognised error', () => {
    expect(classifyTokenError(new Error('weird')).code).toBe('UNKNOWN');
    expect(classifyTokenError('nope').code).toBe('UNKNOWN');
  });
});

describe('probe classification', () => {
  it('treats a missing or revoked grant as grant_required', () => {
    for (const code of ['NO_NEXUS_GRANT', 'NEEDS_NEXUS_LOGIN', 'NEEDS_RELOGIN']) {
      expect(classifyNexusProbe({ code })).toBe('grant_required');
    }
  });

  it('treats an outage as degraded', () => {
    expect(classifyNexusProbe({ code: 'NEXUS_UNAVAILABLE' })).toBe('degraded');
    expect(classifyNexusProbe({ responseCode: 401 })).toBe('degraded');
    expect(classifyNexusProbe({ responseCode: 503 })).toBe('degraded');
  });

  it('is granted otherwise', () => {
    expect(classifyNexusProbe({ responseCode: 200 })).toBe('granted');
  });

  it('selects the fallback only while degraded', () => {
    expect(fallbackSelected('degraded')).toBe(true);
    expect(fallbackSelected('grant_required')).toBe(false);
    expect(fallbackSelected('granted')).toBe(false);
  });

  it('separates grant codes from offline codes', () => {
    expect(nexusGrantRequired('NO_NEXUS_GRANT')).toBe(true);
    expect(nexusGrantRequired('NEXUS_UNAVAILABLE')).toBe(false);
    expect(nexusOfflineCode('NEXUS_UNAVAILABLE')).toBe(true);
    expect(nexusOfflineCode('RATE_LIMITED')).toBe(false);
  });
});

describe('nexusErrorMessage', () => {
  it('maps codes to user copy', () => {
    expect(nexusErrorMessage('NO_NEXUS_GRANT')).toContain('Sign in');
    expect(nexusErrorMessage('NEXUS_UNAVAILABLE')).toContain('could not be reached');
    expect(nexusErrorMessage('COMMAND_NOT_ALLOWED')).toContain('not available');
    expect(nexusErrorMessage('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
    expect(nexusErrorMessage(undefined)).toBe('Something went wrong.');
  });
});
