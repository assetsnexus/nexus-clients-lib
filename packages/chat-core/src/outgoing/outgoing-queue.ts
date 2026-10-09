export type OutgoingHold = 'streaming' | 'unreachable';

export type OutgoingQueuedMessage = {
  id: string;
  threadKey: string;
  text: string;
  attachmentRefs?: unknown[];
  modelOverride?: unknown;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null;
  localTurnId?: string | null;
  createdAt: number;
  lastError?: string;
  hold: OutgoingHold;
};

const TEXT_MAX = 100_000;
const THREAD_MAX = 240;

export function outgoingThreadKey(input: { conversationId?: string | null; contactId?: string | null }): string {
  const conv = typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
  if (conv) return `conv:${conv.slice(0, THREAD_MAX)}`;
  const contact = typeof input.contactId === 'string' ? input.contactId.trim() : '';
  if (contact) return `contact:${contact.slice(0, THREAD_MAX)}`;
  return 'draft';
}

export type OutgoingSendQueue = ReturnType<typeof createOutgoingSendQueue>;

export function createOutgoingSendQueue(opts?: { now?: () => number; nextId?: () => string }) {
  let items: OutgoingQueuedMessage[] = [];
  let seq = 0;
  const now = opts?.now ?? (() => Date.now());
  const nextId =
    opts?.nextId ??
    (() => {
      seq += 1;
      return `q_${now()}_${seq}`;
    });

  return {
    list(): OutgoingQueuedMessage[] {
      return items.slice();
    },
    listForThread(threadKey: string): OutgoingQueuedMessage[] {
      return items.filter((item) => item.threadKey === threadKey);
    },
    enqueue(entry: Omit<OutgoingQueuedMessage, 'id' | 'createdAt'>): string | null {
      const threadKey = typeof entry.threadKey === 'string' ? entry.threadKey.trim() : '';
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      const attachmentRefs = Array.isArray(entry.attachmentRefs) ? entry.attachmentRefs : undefined;
      if (!threadKey || threadKey.length > THREAD_MAX) return null;
      if ((!text && !attachmentRefs?.length) || text.length > TEXT_MAX) return null;
      const hold = entry.hold === 'streaming' ? 'streaming' : 'unreachable';
      const id = nextId();
      items = [
        ...items,
        {
          id,
          threadKey,
          text,
          attachmentRefs,
          modelOverride: entry.modelOverride,
          reasoningEffort: entry.reasoningEffort ?? null,
          localTurnId: entry.localTurnId ?? null,
          createdAt: now(),
          ...(entry.lastError ? { lastError: entry.lastError.replace(/\s+/g, ' ').trim().slice(0, 240) } : {}),
          hold,
        },
      ];
      return id;
    },
    remove(id: string) {
      items = items.filter((item) => item.id !== id);
    },
    markError(id: string, message: string) {
      const lastError = message.replace(/\s+/g, ' ').trim().slice(0, 240);
      items = items.map((item) => (item.id === id ? { ...item, lastError: lastError || item.lastError } : item));
    },
    /** Drops this thread's unsent queue only. Other threads stay. */
    cancelThread(threadKey: string): OutgoingQueuedMessage[] {
      const removed = items.filter((item) => item.threadKey === threadKey);
      items = items.filter((item) => item.threadKey !== threadKey);
      return removed;
    },
  };
}
