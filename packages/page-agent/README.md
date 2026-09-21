# @nexus/page-agent

Framework-free page tour / form-copilot executor for ANX clients.

- Tiny page pointer on every chat send (never dump `pageData`)
- `anx.page.understand` loads page instructions + extra tools for **this turn only**
- Outline / highlight / form preview + revert
- Host adapters supply search, access, navigate

Portal and other `@nexus/chat-core` hosts mount this; Vue is not a dependency.
