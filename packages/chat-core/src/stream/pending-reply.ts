/**
 * When the live socket never connects, message.send returns before dispatch
 * writes the new assistant row. The messages list still ends with the previous
 * reply. Only a row that was not in the pre-send snapshot may fill the bubble.
 */

export type ListedChatMessage = {
  id?: string;
  role?: string;
  content?: string;
  createdAt?: string;
  toolCalls?: Array<Record<string, unknown>>;
};

export type AssistantWatermark = {
  ids: string[];
  fingerprints: string[];
  /** True when the pre-send list call succeeded, including an empty history. */
  snapshotted: boolean;
};

export function fingerprintListedMessage(message: ListedChatMessage): string {
  const created = typeof message.createdAt === 'string' ? message.createdAt : '';
  const content = typeof message.content === 'string' ? message.content : '';
  return `${message.role || ''}|${created}|${content}`;
}

export function watermarkFromMessages(messages: ListedChatMessage[]): AssistantWatermark {
  const assistants = messages.filter((message) => message.role === 'assistant');
  return {
    ids: assistants
      .map((message) => (typeof message.id === 'string' ? message.id : ''))
      .filter(Boolean),
    fingerprints: assistants.map(fingerprintListedMessage),
    snapshotted: true,
  };
}

export function emptyWatermark(snapshotted: boolean): AssistantWatermark {
  return { ids: [], fingerprints: [], snapshotted };
}

export function assistantReplyReady(message: ListedChatMessage): boolean {
  if (typeof message.content === 'string' && message.content.trim()) return true;
  return Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
}

function createdAtMs(message: ListedChatMessage): number | null {
  if (typeof message.createdAt !== 'string' || !message.createdAt) return null;
  const parsed = Date.parse(message.createdAt);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Newest assistant row that cannot be the pre-send history.
 * Without a successful snapshot, only `createdAt >= sentAtMs` counts.
 */
export function findNewerAssistantMessage(
  messages: ListedChatMessage[],
  watermark: AssistantWatermark,
  sentAtMs: number,
): ListedChatMessage | null {
  const ids = new Set(watermark.ids);
  const fingerprints = new Set(watermark.fingerprints);
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'assistant') continue;
    const id = typeof message.id === 'string' ? message.id : '';
    if (watermark.snapshotted && id && !ids.has(id)) return message;
    const created = createdAtMs(message);
    const afterSend = created != null && created >= sentAtMs;
    if (!afterSend) continue;
    if (!id && fingerprints.has(fingerprintListedMessage(message))) continue;
    if (!watermark.snapshotted || !id) return message;
  }
  return null;
}

export async function pollNewerAssistantMessage(input: {
  list: () => Promise<ListedChatMessage[]>;
  watermark: AssistantWatermark;
  sentAtMs: number;
  intervalMs: number;
  maxAttempts: number;
  onListError?: (err: unknown, attempt: number) => void;
}): Promise<ListedChatMessage | null> {
  const maxAttempts = Math.max(1, input.maxAttempts);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && input.intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
    }
    let messages: ListedChatMessage[] = [];
    try {
      messages = await input.list();
    } catch (err) {
      input.onListError?.(err, attempt);
      continue;
    }
    const found = findNewerAssistantMessage(messages, input.watermark, input.sentAtMs);
    if (found && assistantReplyReady(found)) return found;
  }
  return null;
}
