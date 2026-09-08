# @nexus/chat-vue2
Vue 2.7 adapter over `@nexus/chat-core` for the portal.

## Exports
- `createNexusChat` re-exports + contact helpers
- `NexusChatPanel` — SolarTome-grade panel (sidebar, markdown transcript, composer, attachments, tool timeline, leave section, browser-call overlay)
- Voice: `RealtimeCallPanel`, `ActivePhoneChip`, `CallModeChooserModal`
- `GroupRoomLeaveSection`
- `renderChatMarkdown` — marked + DOMPurify
- Specialized tool widgets (Options API): `ToolCallTimeline`, media / choice / check-back / storage / default / sub-agent

## Styles
Import once in the host app:

```js
import '@nexus/chat-vue2/style.css'
```

## Embed / host modes
- **Embed:** `<NexusChatPanel :chat="chat" />` — subscribes to chat-core state and auto-sends
- **Host (portal):** pass `:panel` + contacts/rooms + `@send`; fill slots `#toolbar`, `#disclosure`, `#queue`, `#data-access`

## Build
`npm run build` — Vite + `@vitejs/plugin-vue2` (SFC → JS + `.d.ts` + `style.css`).
