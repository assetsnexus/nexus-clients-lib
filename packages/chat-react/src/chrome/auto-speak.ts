/**
 * Auto-speak queue for the spoken (auto-voice) channel.
 *
 * One controller per agent, and speech is serialised through a small queue:
 * two replies arriving at once must not talk over each other, and a newer reply
 * for the same agent replaces that agent's not-yet-started text (a burst reads
 * as the latest message, not a backlog).
 *
 * The TTS controller is injected, so the queue policy is unit-testable without a
 * region, an audio device, or a DOM. This is the shared sibling of the desktop's
 * `createMessageSpeaker`: the desktop keeps its own copy for the OS-notification
 * rail (it is bound to main-process gating), while the composer — shared by the
 * portal, the app, and the desktop — uses this one so barge-in behaves the same
 * everywhere.
 */

import {
  normalizeVoiceInterruptPolicy,
  shouldClearQueueOnSend,
  shouldStopOnSend,
  type VoiceInterruptPolicy,
} from './voice-interrupt.js';

/** Minimal contract of a speak turn controller. */
export type AutoSpeakController = {
  speak(text: string): Promise<void>;
  cancel(): Promise<void> | void;
};

export type AutoSpeakFactory = (agentId: string | null) => AutoSpeakController;

export type AutoSpeakQueue = {
  /** Speak `text` for `agentId`; replaces this agent's not-yet-started text. */
  speak(text: string, agentId: string | null): void;
  /** A new user input: apply the configured interruption policy. */
  interrupt(): void;
  /** Stop everything and drop the queue (focus regained, sign-out). */
  cancel(): void;
  /** Drop cached controllers (identity switch). */
  reset(): void;
  /** True while a turn is playing or queued (for tests/diagnostics). */
  isBusy(): boolean;
};

export function createAutoSpeakQueue(deps: {
  createController: AutoSpeakFactory;
  /**
   * Read fresh at interrupt time so a change in Settings applies immediately
   * without rebuilding the composer.
   */
  getInterruptPolicy?: () => VoiceInterruptPolicy;
}): AutoSpeakQueue {
  const controllers = new Map<string, AutoSpeakController>();
  const pending = new Map<string, string>();
  const order: string[] = [];
  let running = false;
  let cancelled = false;

  const keyOf = (agentId: string | null): string => agentId ?? '__default__';

  function controllerFor(agentId: string | null): AutoSpeakController {
    const key = keyOf(agentId);
    let controller = controllers.get(key);
    if (!controller) {
      controller = deps.createController(agentId);
      controllers.set(key, controller);
    }
    return controller;
  }

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (order.length > 0) {
        if (cancelled) break;
        const key = order.shift() as string;
        const text = pending.get(key);
        pending.delete(key);
        if (!text) continue;
        try {
          await controllerFor(key === '__default__' ? null : key).speak(text);
        } catch {
          // A failed turn (no model configured, device busy) must not wedge the
          // queue: drop it and move on to the next message.
        }
      }
    } finally {
      running = false;
    }
  }

  const stopControllers = (): void => {
    for (const controller of controllers.values()) {
      try {
        void controller.cancel();
      } catch {
        /* best-effort */
      }
    }
  };

  return {
    speak(text: string, agentId: string | null): void {
      const trimmed = String(text || '').trim();
      if (!trimmed) return;
      cancelled = false;
      const key = keyOf(agentId);
      if (!pending.has(key)) order.push(key);
      pending.set(key, trimmed);
      void drain();
    },

    interrupt(): void {
      const policy = normalizeVoiceInterruptPolicy(deps.getInterruptPolicy?.() ?? 'skip_current');
      if (!shouldStopOnSend(policy)) return;
      // Stop the utterance playing right now. Its `await speak(...)` resolves, so
      // the drain loop naturally moves on to the next queued reply.
      stopControllers();
      if (shouldClearQueueOnSend(policy)) {
        // Also drop everything still queued behind the current utterance.
        pending.clear();
        order.length = 0;
      }
    },

    cancel(): void {
      cancelled = true;
      pending.clear();
      order.length = 0;
      stopControllers();
    },

    reset(): void {
      this.cancel();
      controllers.clear();
    },

    isBusy(): boolean {
      return running || order.length > 0;
    },
  };
}
