import type { CommandClient, NexusChat } from '@nexus/chat-core';

/**
 * History load for a conversation opened from the sidebar.
 *
 * `chat.listMessages` is the normal path. When the list says the thread has
 * content but `messages.list` comes back empty, we make one more attempt with
 * `anx.communicate.conversations.get`, which for older threads carries the body
 * as `messages` / `turns`. This is what stops a row the list says has content
 * from opening as a silently blank thread; a genuinely empty thread still ends
 * up empty, and the panel renders its explicit "Send a message to start."
 * empty state.
 */

type MessageRow = Record<string, unknown>;

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const rec = result as Record<string, unknown>;
  if (rec.data && typeof rec.data === 'object') return rec.data as Record<string, unknown>;
  if (rec.responseObject && typeof rec.responseObject === 'object') {
    return rec.responseObject as Record<string, unknown>;
  }
  return rec;
}

function rowsToTurns(rows: MessageRow[]) {
  return rows.map((m) => ({
    id: m.id as string | undefined,
    role: String(m.role || 'assistant'),
    content: String(m.content ?? m.text ?? ''),
    toolCalls: Array.isArray(m.toolCalls) ? (m.toolCalls as Array<Record<string, unknown>>) : undefined,
    attachments: m.attachments as never,
    createdAt: (m.createdAt as string) || null,
    senderId: (m.senderId as string) || null,
    senderName: (m.senderName as string) || null,
  }));
}

/** True when `conversations.get` carried a turn/message body for this thread. */
function getBodyRows(data: Record<string, unknown>): MessageRow[] {
  if (Array.isArray(data.messages)) return data.messages as MessageRow[];
  if (Array.isArray(data.turns)) return data.turns as MessageRow[];
  return [];
}

/**
 * Load and rehydrate a conversation's history.
 *
 * @param expectsContent row says the thread has messages (portal `messageCount`
 *   / a preview), so an empty `messages.list` is worth a second attempt.
 * @returns how many turns were rehydrated and which command supplied them.
 */
export async function loadThreadHistory(input: {
  chat: NexusChat;
  client?: CommandClient | null;
  conversationId: string;
  expectsContent?: boolean;
}): Promise<{ turnCount: number; via: 'list' | 'get' | 'none' }> {
  const { chat, client, conversationId } = input;
  let rows: MessageRow[] = [];
  try {
    const messages = await chat.listMessages(conversationId, { limit: 80 });
    rows = (messages || []) as MessageRow[];
  } catch {
    rows = [];
  }
  if (rows.length) {
    chat.rehydrateTurns(rowsToTurns(rows), { conversationId, detachStream: true });
    return { turnCount: rows.length, via: 'list' };
  }

  // Empty list: only worth a second command when the row claims content.
  if (client && input.expectsContent) {
    try {
      const result = await client.send('anx.communicate.conversations.get', { conversationId });
      const denied =
        result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false;
      if (!denied) {
        const body = getBodyRows(unwrapData(result));
        if (body.length) {
          chat.rehydrateTurns(rowsToTurns(body), { conversationId, detachStream: true });
          return { turnCount: body.length, via: 'get' };
        }
      }
    } catch {
      // A get failure is not fatal: the thread opens empty, which is honest.
    }
  }

  chat.rehydrateTurns([], { conversationId, detachStream: true });
  return { turnCount: 0, via: 'none' };
}
