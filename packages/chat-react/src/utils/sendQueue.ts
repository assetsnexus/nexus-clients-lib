export type QueuedSend = {
  id: string;
  text: string;
  attachmentRefs?: unknown[];
  modelOverride?: unknown;
  createdAt: number;
  lastError?: string;
};

export type SendQueue = {
  list: () => QueuedSend[];
  enqueue: (item: Omit<QueuedSend, 'id' | 'createdAt'>) => string;
  remove: (id: string) => void;
  markError: (id: string, message: string) => void;
};

export function createSendQueue(): SendQueue {
  let items: QueuedSend[] = [];
  return {
    list: () => [...items],
    enqueue(entry) {
      const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      items = [
        ...items,
        {
          id,
          text: entry.text,
          attachmentRefs: entry.attachmentRefs,
          modelOverride: entry.modelOverride,
          createdAt: Date.now(),
        },
      ];
      return id;
    },
    remove(id) {
      items = items.filter((i) => i.id !== id);
    },
    markError(id, message) {
      items = items.map((i) => (i.id === id ? { ...i, lastError: message } : i));
    },
  };
}
