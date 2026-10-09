import { describe, expect, it } from 'vitest';
import {
  commandFailureError,
  nexusSessionCode,
  readCommandFailureCode,
} from './command-failure.js';

describe('command failure codes', () => {
  it('reads a top-level session code ahead of kind', () => {
    const result = { ok: false, kind: 'error', code: 'NO_NEXUS_GRANT', message: 'Sign in.' };
    expect(readCommandFailureCode(result)).toBe('NO_NEXUS_GRANT');
    expect(nexusSessionCode(readCommandFailureCode(result))).toBe('NO_NEXUS_GRANT');
    expect(nexusSessionCode('NEEDS_NEXUS_LOGIN')).toBe('NEEDS_NEXUS_LOGIN');
    expect(nexusSessionCode('command_error')).toBeUndefined();
  });

  it('keeps the server code on the error object', () => {
    const error = commandFailureError(
      { ok: false, code: 'NEEDS_NEXUS_LOGIN', message: 'Sign in with Nexus to chat.' },
      'conversations.create failed',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Sign in with Nexus to chat.');
    expect(error.code).toBe('NEEDS_NEXUS_LOGIN');
  });

  it('reads a nested error code when the top-level code is absent', () => {
    expect(readCommandFailureCode({ ok: false, error: { code: 'NO_NEXUS_GRANT' } })).toBe(
      'NO_NEXUS_GRANT',
    );
  });
});
