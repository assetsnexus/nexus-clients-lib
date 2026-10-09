/**
 * Host-supplied chat completion used when Nexus is offline or the user
 * has no Nexus grant. The library does not know which product implements it.
 * The request matches the OpenAI chat-completions shape.
 */

export type FallbackChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type FallbackChatRequest = {
  model?: string;
  messages: FallbackChatMessage[];
};

/** Optional cards from the host transport. Not a tool timeline. */
export type FallbackChatCard = {
  id?: string;
  title?: string;
  body?: string;
  kind?: string;
};

export type FallbackChatCompletion = {
  choices?: Array<{
    message?: { role?: string; content?: string | null };
  }>;
  cards?: FallbackChatCard[];
};

export type FallbackChatTransport = {
  /**
   * Host says the Nexus command path cannot be used.
   * Read again on every send so the host can flip it without rebuilding the chat.
   */
  nexusUnavailable: boolean | (() => boolean);
  complete: (request: FallbackChatRequest) => Promise<FallbackChatCompletion>;
};

export function fallbackTransportSelected(
  transport: FallbackChatTransport | null | undefined,
): boolean {
  if (!transport || typeof transport.complete !== 'function') return false;
  const flag = transport.nexusUnavailable;
  try {
    return typeof flag === 'function' ? flag() === true : flag === true;
  } catch {
    return false;
  }
}

export function fallbackMessagesFromTurns(
  turns: Array<{ role?: string | null; text?: string | null }>,
): FallbackChatMessage[] {
  const messages: FallbackChatMessage[] = [];
  for (const turn of turns || []) {
    const role = turn.role === 'assistant' || turn.role === 'system' ? turn.role : turn.role === 'user' ? 'user' : null;
    const content = typeof turn.text === 'string' ? turn.text : '';
    if (!role || !content.trim()) continue;
    messages.push({ role, content });
  }
  return messages;
}

function cardText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

export function normalizeFallbackCards(cards: unknown): FallbackChatCard[] {
  if (!Array.isArray(cards)) return [];
  const out: FallbackChatCard[] = [];
  for (const item of cards) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title = cardText(row.title);
    const body = cardText(row.body) || cardText(row.text) || cardText(row.summary);
    const kind = cardText(row.kind);
    const id = cardText(row.id);
    if (!title && !body) continue;
    out.push({
      ...(id ? { id } : {}),
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(kind ? { kind } : {}),
    });
  }
  return out;
}

export function assistantFromFallbackCompletion(completion: FallbackChatCompletion | null | undefined): {
  text: string;
  cards: FallbackChatCard[];
} {
  const choice = completion?.choices?.[0]?.message?.content;
  const text = typeof choice === 'string' ? choice : '';
  return { text, cards: normalizeFallbackCards(completion?.cards) };
}
