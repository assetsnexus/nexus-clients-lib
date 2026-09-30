import { useState, useSyncExternalStore } from 'react';
import type { ChatState, NexusChat } from '@nexus/chat-core';

export function useChatState(chat: NexusChat): ChatState {
  return useSyncExternalStore(
    (onStoreChange) => chat.subscribe(onStoreChange),
    () => chat.getState(),
    () => chat.getState(),
  );
}

/** Mutable local state helper for queues / UI-only flags. */
export function useForceUpdate(): () => void {
  const [, set] = useState(0);
  return () => set((n) => n + 1);
}

export function useChatPanel(chat: NexusChat) {
  const state = useChatState(chat);
  const panel = state.panels[state.activePanelIndex] || null;
  return { state, panel };
}
