import type { NexusChat } from '@nexus/chat-core';
import { openContactThread } from '../utils/openContactFlow.js';
import { dropStashedHostMessage, type HostPrefillComposerMessage } from './host-bridge.js';

const AGENT_CONTACT_TYPES = new Set(['agent', 'asset_agent']);

export type PrefillContactState = {
  panels: Array<{ contactId?: string; contactType?: string }>;
  activePanelIndex: number;
  selectedAgentId?: string | null;
};

/** Explicit contact, otherwise the open agent thread, otherwise the last selected agent. */
export function resolvePrefillContactId(state: PrefillContactState, explicit?: string): string {
  const requested = explicit?.trim() || '';
  if (requested) return requested;
  const panel = state.panels[state.activePanelIndex];
  if (panel?.contactId && panel.contactType && AGENT_CONTACT_TYPES.has(panel.contactType)) {
    return panel.contactId;
  }
  return state.selectedAgentId?.trim() || '';
}

/** Contact to open for a prefill. Null when that thread is already active. */
export function prefillContactToOpen(state: PrefillContactState, explicit?: string): string | null {
  const target = resolvePrefillContactId(state, explicit);
  const current = state.panels[state.activePanelIndex]?.contactId || '';
  if (!target || target === current) return null;
  return target;
}

/**
 * Show the chat composer, append the draft, and open the target contact.
 * Never sends.
 */
export function applyPrefillComposer(input: {
  chat: NexusChat;
  message: HostPrefillComposerMessage;
  ensureChatRoute: () => void;
  applyDraft: (text: string) => void;
}): void {
  let openedContact = false;
  try {
    input.ensureChatRoute();
    input.applyDraft(input.message.text);
    const snap = input.chat.getState();
    const target = prefillContactToOpen(snap, input.message.contactId);
    openedContact = Boolean(target);
    if (target) {
      void openContactThread(input.chat, target).catch((err: unknown) => {
        console.warn('[nexus-chat] prefillComposer open contact failed', {
          contactId: target,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } finally {
    dropStashedHostMessage('prefillComposer');
  }
  console.info('[nexus-chat] prefillComposer applied', {
    chars: input.message.text.length,
    contactId: input.message.contactId || null,
    openedContact,
  });
}
