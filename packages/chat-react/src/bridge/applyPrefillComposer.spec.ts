import { describe, expect, it, vi } from 'vitest';
import type { NexusChat } from '@nexus/chat-core';
import { applyPrefillComposer, prefillContactToOpen, resolvePrefillContactId } from './applyPrefillComposer.js';
import { drainStashedHostMessages, stashHostMessage } from './host-bridge.js';

const agentPanel = { contactId: 'agent-1', contactType: 'agent' as const };
const userPanel = { contactId: 'user-1', contactType: 'user' as const };

describe('resolvePrefillContactId', () => {
  it('uses the explicit contact', () => {
    expect(
      resolvePrefillContactId(
        { panels: [agentPanel], activePanelIndex: 0, selectedAgentId: 'other' },
        '  given  ',
      ),
    ).toBe('given');
  });

  it('uses the open agent contact when no id is given', () => {
    expect(
      resolvePrefillContactId({ panels: [agentPanel], activePanelIndex: 0, selectedAgentId: 'other' }),
    ).toBe('agent-1');
  });

  it('falls back to the last selected agent when the open thread is not an agent', () => {
    expect(
      resolvePrefillContactId({
        panels: [userPanel],
        activePanelIndex: 0,
        selectedAgentId: 'agent-9',
      }),
    ).toBe('agent-9');
  });

  it('returns empty when nothing is active', () => {
    expect(resolvePrefillContactId({ panels: [], activePanelIndex: 0, selectedAgentId: null })).toBe('');
  });
});

describe('prefillContactToOpen', () => {
  it('does not reopen the contact that is already active', () => {
    expect(
      prefillContactToOpen({ panels: [agentPanel], activePanelIndex: 0, selectedAgentId: 'agent-1' }, 'agent-1'),
    ).toBeNull();
  });

  it('opens the last agent when the current thread is a user', () => {
    expect(
      prefillContactToOpen({ panels: [userPanel], activePanelIndex: 0, selectedAgentId: 'agent-9' }),
    ).toBe('agent-9');
  });
});

describe('applyPrefillComposer', () => {
  it('appends the draft and opens another contact without sending', async () => {
    stashHostMessage({ type: 'prefillComposer', text: 'stashed' });
    const opened: string[] = [];
    const sendMessage = vi.fn();
    const chat = {
      getState: () => ({
        panels: [userPanel],
        activePanelIndex: 0,
        selectedAgentId: 'agent-9',
      }),
      openLatest: vi.fn(async (contact: { id: string }) => {
        opened.push(contact.id);
        return { conversationId: null };
      }),
      sendMessage,
    } as unknown as NexusChat;

    const drafts: string[] = [];
    let route = 'scene';
    applyPrefillComposer({
      chat,
      message: { type: 'prefillComposer', text: '  ask about this  ' },
      ensureChatRoute: () => {
        route = 'chat';
      },
      applyDraft: (text) => drafts.push(text),
    });

    expect(route).toBe('chat');
    expect(drafts).toEqual(['  ask about this  ']);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(drainStashedHostMessages().some((m) => m.type === 'prefillComposer')).toBe(false);
    await vi.waitFor(() => expect(opened).toEqual(['agent-9']));
  });
});
