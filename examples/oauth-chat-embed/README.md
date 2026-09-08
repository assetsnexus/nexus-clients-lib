# OAuth chat embed example

Minimal Vue 3 example for embedding Nexus chat with the shipped npm packages:

- `@nexus/commands-client`
- `@nexus/chat-core`
- `@nexus/chat-vue3`

## What it shows

- OAuth bearer token passed into `NexusClient`
- `createNexusChat()` as the single messenger controller
- Vue 3 host mounting the shared `NexusChatPanel`

## Required grant

At minimum, the OAuth client must include group `communicate`.

Optional features in the example can additionally require:

- `inference`
- existing-agent commands for approvals
- `security.data-access`

## Run shape

This example is intentionally minimal and is meant as a smoke/reference app for
package consumers. Replace the placeholder token acquisition with your OAuth
PKCE or backend token exchange flow.
