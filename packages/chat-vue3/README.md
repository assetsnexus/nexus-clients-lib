# @nexus/chat-vue3
Vue 3 reference UI over `@nexus/chat-core` for OAuth embeds.

Same panel stack as `@nexus/chat-vue2`:
- `NexusChatPanel` (chat controller or host `panel` props)
- `RealtimeCallPanel`, `ActivePhoneChip`, `CallModeChooserModal`
- `GroupRoomLeaveSection`, tool widgets, `renderChatMarkdown`

```ts
import { createNexusChat } from '@nexus/chat-core';
import { NexusChatPanel } from '@nexus/chat-vue3';
import '@nexus/chat-vue3/style.css';

createApp({ render: () => h(NexusChatPanel, { chat }) }).mount('#chat');
```

Build: `npm run build` (Vite + `@vitejs/plugin-vue` + `vue-tsc` available for typecheck).
