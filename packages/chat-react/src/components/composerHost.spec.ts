import { describe, expect, it } from 'vitest';
import type { ChatVoiceCallSession, IoDescriptor } from '@nexus/chat-core';
import {
  activeComposerCall,
  attachmentDisplayName,
  composerCallSnapshot,
  resolveComposerCallTarget,
} from './composerHost.js';

describe('composer host controls', () => {
  it('names attachments without inventing a filename', () => {
    const inline: IoDescriptor = { kind: 'inline', mimeType: 'text/plain', dataBase64: 'YQ==', byteLength: 1 };
    expect(attachmentDisplayName({ ...inline, filename: ' notes.txt ' }, 0)).toBe('notes.txt');
    expect(attachmentDisplayName(inline, 2)).toBe('Attachment 3');
  });

  it('resolves an agent call target and ignores people', () => {
    const contacts = [
      { id: 'user-1', type: 'user' as const, agentId: null, virtualEmployeeId: null },
      {
        id: 'contact-1',
        type: 'agent' as const,
        agentId: 'agent-9',
        virtualEmployeeId: 've-host-1',
      },
    ];
    expect(resolveComposerCallTarget(contacts, 'contact-1')).toEqual({
      agentId: 'agent-9',
      virtualEmployeeId: 've-host-1',
    });
    expect(resolveComposerCallTarget(contacts, 'user-1')).toBeNull();
    expect(resolveComposerCallTarget(contacts, 'missing')).toBeNull();
  });

  it('keeps a live phone call and drops an ended one', () => {
    const calls: ChatVoiceCallSession[] = [
      { agentId: 'agent-9', callSid: 'old', status: 'ended' },
      { agentId: 'agent-9', callSid: 'CA1', status: 'ringing', mode: 'outbound', toMasked: '+1••••12' },
    ];
    expect(activeComposerCall(calls)?.callSid).toBe('CA1');
    const snap = composerCallSnapshot(calls, { status: 'idle', callSid: null });
    expect(snap.active).toBe(true);
    expect(snap.toMasked).toBe('+1••••12');
    expect(composerCallSnapshot([{ agentId: 'agent-9', callSid: 'old', status: 'ended' }]).active).toBe(false);
  });

  it('surfaces a dial-in number from the session', () => {
    const snap = composerCallSnapshot([
      {
        agentId: 'agent-9',
        callSid: 'inbound-wait-agent-9',
        status: 'waiting_inbound',
        mode: 'inbound',
        dialIn: { phoneE164: '+15551212', phoneDisplay: '+1 555 1212', accessCode: '42' },
      },
    ]);
    expect(snap.dialIn).toEqual({ phone: '+1 555 1212', accessCode: '42' });
    expect(snap.active).toBe(true);
  });

  it('keeps the failure text after a call leaves the live set', () => {
    const snap = composerCallSnapshot([
      { agentId: 'agent-9', callSid: 'CA1', status: 'error', errorMessage: ' The phone did not answer. ' },
    ]);
    expect(snap.active).toBe(false);
    expect(snap.error).toBe('The phone did not answer.');
    const live = composerCallSnapshot([
      { agentId: 'agent-9', callSid: 'live', status: 'ringing' },
      { agentId: 'agent-9', callSid: 'fail', status: 'error', errorMessage: 'no answer' },
    ]);
    expect(live.active).toBe(true);
    expect(live.callSid).toBe('live');
    expect(live.error).toBeNull();
    expect(
      composerCallSnapshot([
        { agentId: 'agent-9', callSid: 'CA1', status: 'error', errorMessage: 'old' },
        { agentId: 'agent-9', callSid: 'CA2', status: 'ended' },
      ]).error,
    ).toBeNull();
  });
});
