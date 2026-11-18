/**
 * A small typed event bus.
 *
 * A host needs to hook into what the SDK does — analytics, SEO page events, a
 * toast, a UI refresh — without forking the SDK or polling state. The bus is
 * deliberately tiny and synchronous:
 *
 * - `on(type | '*', listener)` and `on(predicate, listener)` both return an
 *   unsubscribe function.
 * - `emit` is public, so a host can publish its own `app.*` events on the same
 *   rail and keep one subscription model for its UI.
 * - A throwing listener is isolated: it is reported to `onError` and never
 *   breaks the operation that emitted the event.
 *
 * No event carries a token, a message body or any other secret. The payloads
 * are ids, command names, codes and timings.
 */
import type { NexusAccessProbe, NexusIdentityLevel, NexusSubjectType, NexusTokenErrorCode } from './types.js';

export type NexusSessionEvent =
  | { type: 'session.started'; sessionId: string; subjectType: NexusSubjectType }
  | { type: 'session.completed'; sessionId: string; level: NexusIdentityLevel }
  | { type: 'session.refreshed'; sessionId: string }
  | { type: 'session.revoked'; sessionId: string }
  | { type: 'session.failed'; sessionId: string; code: NexusTokenErrorCode }
  | {
      type: 'command.sent';
      sessionId: string;
      command: string;
      ok: boolean;
      responseCode: number;
      durationMs: number;
    }
  | {
      type: 'command.failed';
      sessionId: string;
      command: string;
      responseCode: number;
      code?: string;
    }
  | { type: 'probe'; sessionId: string; result: NexusAccessProbe }
  | { type: 'identity.switched'; from: string; to: string; subjectType: NexusSubjectType };

/** Host-published events. `app.` is reserved so they cannot collide. */
export type NexusAppEvent = { type: `app.${string}` } & Record<string, unknown>;

export type NexusEvent = NexusSessionEvent | NexusAppEvent;

export type NexusEventListener = (event: NexusEvent) => void;
export type NexusEventFilter = (event: NexusEvent) => boolean;

export type NexusEventBus = {
  /** Subscribe by exact type, or `'*'` for everything. Returns an unsubscribe. */
  on(type: NexusEvent['type'] | '*', listener: NexusEventListener): () => void;
  /** Subscribe with a predicate. Returns an unsubscribe. */
  on(filter: NexusEventFilter, listener: NexusEventListener): () => void;
  /** One-shot subscription. Returns an unsubscribe. */
  once(type: NexusEvent['type'] | '*', listener: NexusEventListener): () => void;
  /** Publish an event. Hosts use this for their own `app.*` events. */
  emit(event: NexusEvent): void;
  /** Remove every listener. */
  clear(): void;
  listenerCount(): number;
};

type Entry = {
  match: (event: NexusEvent) => boolean;
  listener: NexusEventListener;
  once: boolean;
};

export function createNexusEventBus(opts: {
  onError?: (err: unknown, event: NexusEvent) => void;
} = {}): NexusEventBus {
  const entries: Entry[] = [];

  function add(entry: Entry): () => void {
    entries.push(entry);
    return () => {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    };
  }

  function on(
    typeOrFilter: NexusEvent['type'] | '*' | NexusEventFilter,
    listener: NexusEventListener,
  ): () => void {
    const match =
      typeof typeOrFilter === 'function'
        ? typeOrFilter
        : typeOrFilter === '*'
          ? () => true
          : (event: NexusEvent) => event.type === typeOrFilter;
    return add({ match, listener, once: false });
  }

  return {
    on: on as NexusEventBus['on'],
    once(type, listener) {
      return add({
        match: type === '*' ? () => true : (event) => event.type === type,
        listener,
        once: true,
      });
    },
    emit(event) {
      // Copy first: a listener may unsubscribe during dispatch.
      for (const entry of [...entries]) {
        if (!entry.match(event)) continue;
        if (entry.once) {
          const index = entries.indexOf(entry);
          if (index >= 0) entries.splice(index, 1);
        }
        try {
          entry.listener(event);
        } catch (err) {
          opts.onError?.(err, event);
        }
      }
    },
    clear() {
      entries.length = 0;
    },
    listenerCount() {
      return entries.length;
    },
  };
}
