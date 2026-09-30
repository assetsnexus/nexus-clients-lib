import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NexusChatApp } from '@nexus/chat-react';
import { createMockChat } from './mock-chat';

const { chat, client } = createMockChat();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ height: '100vh', padding: 12 }}>
      <NexusChatApp
        chat={chat}
        client={client}
        theme={{ colorAccent: '#6ea8fe', density: 'comfortable' }}
        features={{ adminPanels: true, calls: true }}
        onPostToHost={(msg) => console.log('[sdk→host]', msg)}
      />
    </div>
  </StrictMode>,
);
