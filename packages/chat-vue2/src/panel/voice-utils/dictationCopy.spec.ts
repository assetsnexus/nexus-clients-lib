import { describe, expect, it } from 'vitest';
import { dictationFailureMessage } from '@nexus/chat-core';
import { dictationCopy, micFailureMessageFor, sttFailureMessage } from './dictationCopy';

describe('sttFailureMessage', () => {
  it('shows the shared actionable copy for a raw server error, not the server string', () => {
    const raw = new Error(
      'E11000 duplicate key error collection: anx_agents index: anxVeId_1 dup key { anxVeId: null }',
    );
    const message = sttFailureMessage(raw);
    expect(message).toBe(dictationFailureMessage('transcription-failed'));
    expect(message).not.toMatch(/E11000|dup key|anxVeId|mongo/i);
  });

  it('maps an unreachable service to the connection copy', () => {
    expect(sttFailureMessage(new Error('Nexus could not be reached.'))).toBe(
      dictationFailureMessage('network'),
    );
    expect(sttFailureMessage(new Error('workload timed out'))).toBe(
      dictationFailureMessage('network'),
    );
  });

  it('never echoes the raw error even when the host passed no labels', () => {
    const raw = 'Link a subscription to this agent before chatting.';
    expect(sttFailureMessage(new Error(raw))).not.toContain(raw);
  });

  it('honours a host label override for the resolved code', () => {
    expect(
      sttFailureMessage(new Error('workload timed out'), { sttNetwork: 'Keine Verbindung.' }),
    ).toBe('Keine Verbindung.');
  });

  it('falls back to the shared copy when the host override is empty', () => {
    expect(sttFailureMessage(new Error('boom'), { sttFailed: '' })).toBe(
      dictationFailureMessage('transcription-failed'),
    );
  });
});

describe('micFailureMessageFor', () => {
  it('maps a blocked microphone to the shared denied copy', () => {
    expect(micFailureMessageFor({ name: 'NotAllowedError' })).toBe(
      dictationFailureMessage('mic-denied'),
    );
  });

  it('maps a missing microphone to the shared copy', () => {
    expect(micFailureMessageFor({ name: 'NotFoundError' })).toBe(
      dictationFailureMessage('mic-missing'),
    );
  });

  it('honours host label overrides', () => {
    expect(micFailureMessageFor({ name: 'NotAllowedError' }, { micDenied: 'Zugriff verweigert' })).toBe(
      'Zugriff verweigert',
    );
  });
});

describe('dictationCopy', () => {
  it('returns the shared too-short copy', () => {
    expect(dictationCopy('too-short')).toBe(dictationFailureMessage('too-short'));
  });

  it('returns the shared no-transcript copy', () => {
    expect(dictationCopy('no-transcript')).toBe(dictationFailureMessage('no-transcript'));
  });

  it('honours a host override for the code', () => {
    expect(dictationCopy('transcription-failed', { sttFailed: 'Nichts verstanden' })).toBe(
      'Nichts verstanden',
    );
  });
});
