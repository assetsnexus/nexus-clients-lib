import { createNexusChat, type CommandClient, type NexusChat } from '@nexus/chat-core';

export function createMockChat(): { chat: NexusChat; client: CommandClient } {
  const client: CommandClient = {
    async send(command, payload) {
      if (command === 'anx.communicate.contacts.list') {
        return { data: { contacts: [{ id: 'user-alice', name: 'Alice', type: 'user' }] } };
      }
      if (command === 'anx.ai-agents.virtual-employees.list') {
        return {
          data: [{ id: 'agent-demo', displayName: 'Demo Agent', name: 'Demo Agent' }],
        };
      }
      if (command === 'anx.ai-agents.virtual-employees.list-public') {
        return { data: [] };
      }
      if (command === 'anx.communicate.contacts.asset-agents.list') {
        return { data: { contacts: [] } };
      }
      if (command === 'anx.communicate.stream-init') {
        return { data: { resourceId: 'conv_demo_1', endpoints: [] } };
      }
      if (command === 'anx.communicate.conversations.list') {
        return {
          data: {
            items: [
              {
                conversationId: 'conv_demo_1',
                title: 'Earlier thread',
                agentId: 'agent-demo',
                lastActivityAt: '2026-03-01T00:00:00Z',
                hasMessages: true,
                updatedAt: '2026-03-01T00:00:00Z',
              },
            ],
          },
        };
      }
      if (command === 'anx.communicate.rooms.list') {
        return { data: { rooms: [{ id: 'room_1', title: 'Standup', type: 'group', participantCount: 3 }] } };
      }
      if (command === 'anx.inference.models.available') {
        return {
          ok: true,
          data: {
            models: [
              {
                id: 'm-demo',
                displayName: 'Demo GPT',
                externalModelId: 'openai/gpt-4.1',
                providerId: 'openai',
                intelligenceIndex: 41.2,
                chatPriceCreditsPerMillion: 8,
                capabilities: ['chat_agent', 'text_gen'],
                category: 'chat',
              },
            ],
          },
        };
      }
      return { ok: true, data: payload || {} };
    },
  };

  const chat = createNexusChat({ client, transport: 'direct' });
  void chat.loadContacts();
  return { chat, client };
}
