import { createApp, h } from 'vue';
import { NexusClient, StaticTokenProvider } from '@nexus/commands-client';
import { createNexusChat, DEFAULT_FEATURES } from '@nexus/chat-core';
import { NexusChatPanel } from '@nexus/chat-vue3';
import '@nexus/chat-vue3/style.css';

export function createOauthChatEmbedApp({ baseUrl, accessToken, features = {} }) {
  if (!accessToken || !baseUrl) {
    throw new Error('baseUrl and accessToken are required for createOauthChatEmbedApp().');
  }

  const client = new NexusClient({
    baseUrl,
    tokenProvider: new StaticTokenProvider(accessToken),
  });

  const chat = createNexusChat({
    client,
    transport: 'direct',
    agentSource: 'nexus',
    features: {
      ...DEFAULT_FEATURES,
      userDatabases: false,
      ...features,
    },
  });

  return createApp({
    name: 'OauthChatEmbedExample',
    render() {
      return h('div', { class: 'oauth-chat-embed' }, [
        h('h1', 'Nexus OAuth chat embed'),
        h(NexusChatPanel, {
          chat,
          sidebarOpen: true,
          autoSend: true,
        }),
      ]);
    },
  });
}
