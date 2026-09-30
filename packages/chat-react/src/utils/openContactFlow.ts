import type { ChatContact, CommandClient, NexusChat } from '@nexus/chat-core';
import { findChatContact } from '@nexus/chat-core';

export async function openContactThread(
  chat: NexusChat,
  contactId: string,
  contact?: ChatContact | null,
): Promise<{ conversationId: string | null; created?: boolean }> {
  const resolved =
    contact || findChatContact(chat.getState().contacts, contactId) || ({ id: contactId } as ChatContact);

  if (typeof chat.openLatest === 'function') {
    const res = await chat.openLatest(resolved);
    const conversationId = res.conversationId || null;
    if (conversationId) {
      try {
        const messages = await chat.listMessages(conversationId, { limit: 50 });
        chat.rehydrateTurns(
          (messages as Array<Record<string, unknown>>).map((m) => ({
            id: m.id as string | undefined,
            role: String(m.role || 'assistant'),
            content: String(m.content ?? m.text ?? ''),
            toolCalls: Array.isArray(m.toolCalls)
              ? (m.toolCalls as Array<Record<string, unknown>>)
              : undefined,
            attachments: m.attachments as never,
            createdAt: (m.createdAt as string) || null,
            senderId: (m.senderId as string) || null,
            senderName: (m.senderName as string) || null,
          })),
          { conversationId, detachStream: true },
        );
      } catch {
        chat.rehydrateTurns([], { conversationId, detachStream: true });
      }
      await chat.streamInit({ conversationId, contactId: resolved.id });
      chat.observeSubAgents({ conversationId });
      try {
        await chat.attachLiveGeneration({ conversationId });
      } catch {
        // no live generation
      }
    }
    return { conversationId, created: res.created };
  }

  await chat.streamInit({ contactId: resolved.id });
  const state = chat.getState();
  const panel = state.panels[state.activePanelIndex];
  return { conversationId: panel?.conversationId || state.conversationId };
}

export async function loadConversationHistory(
  client: CommandClient,
  chat: NexusChat,
  conversationId: string,
): Promise<void> {
  if (typeof chat.listMessages === 'function') {
    const messages = await chat.listMessages(conversationId, { limit: 80 });
    chat.rehydrateTurns(
      (messages as Array<Record<string, unknown>>).map((m) => ({
        id: m.id as string | undefined,
        role: String(m.role || 'assistant'),
        content: String(m.content ?? m.text ?? ''),
        toolCalls: Array.isArray(m.toolCalls)
          ? (m.toolCalls as Array<Record<string, unknown>>)
          : undefined,
        attachments: m.attachments as never,
        createdAt: (m.createdAt as string) || null,
        senderId: (m.senderId as string) || null,
        senderName: (m.senderName as string) || null,
      })),
      { conversationId, detachStream: true },
    );
    return;
  }

  const result = await client.send('anx.communicate.conversations.get', { conversationId });
  const data =
    result && typeof result === 'object' && 'data' in result
      ? (result as { data: Record<string, unknown> }).data
      : (result as Record<string, unknown>);
  const messages = Array.isArray(data?.messages)
    ? (data.messages as Array<Record<string, unknown>>)
    : Array.isArray(data?.turns)
      ? (data.turns as Array<Record<string, unknown>>)
      : [];
  chat.rehydrateTurns(
    messages.map((m) => ({
      id: m.id as string | undefined,
      role: String(m.role || 'assistant'),
      content: String(m.content ?? m.text ?? ''),
      toolCalls: Array.isArray(m.toolCalls)
        ? (m.toolCalls as Array<Record<string, unknown>>)
        : undefined,
      attachments: m.attachments as never,
      createdAt: (m.createdAt as string) || null,
      senderId: (m.senderId as string) || null,
      senderName: (m.senderName as string) || null,
    })),
    { conversationId, detachStream: true },
  );
  if (typeof data?.usage === 'object') {
    chat.applyUsage(data.usage as never);
  }
}
