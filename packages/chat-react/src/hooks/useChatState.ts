import { useState, useSyncExternalStore } from 'react';
import type { ChatState, CompanionState, NexusChat } from '@nexus/chat-core';

export function useChatState(chat: NexusChat): ChatState {
  return useSyncExternalStore(
    (onStoreChange) => chat.subscribe(onStoreChange),
    () => chat.getState(),
    () => chat.getState(),
  );
}

/**
 * Plan §P6c — subscribe to just the companion slice.
 *
 * The companion reducer is referentially stable (it returns the *same* object
 * when nothing changed), which is what makes this safe to use with
 * `useSyncExternalStore`: a mood-carrying frame produces a new object, an
 * unrelated turn does not.
 */
export function useCompanionState(chat: NexusChat): CompanionState {
  return useSyncExternalStore(
    (onStoreChange) => chat.subscribe(onStoreChange),
    () => chat.getState().companionState,
    () => chat.getState().companionState,
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
