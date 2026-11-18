/**
 * `@nexus/commands-client/app-kit` — the pieces every Nexus app re-implements.
 *
 * None of this is app-specific: an inbound MCP server, the `custom_http` brain
 * contract, a fallback chat, the seed-catalog hash and the browser command
 * allowlist are the same for every partner. Keeping them here means an app can
 * use only what it needs and leave the rest at its defaults.
 */
export {
  createMcpServer,
  mcpJsonResult,
  mcpErrorResult,
  MCP_PROTOCOL_VERSION,
} from './mcp-server.js';
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpServer,
  McpServerOptions,
  McpToolHandler,
  McpToolResult,
  McpToolSchema,
} from './mcp-server.js';

export {
  canonicalJson,
  catalogHash,
  grantedCommandsFromList,
  missingPermissions,
} from './seed-catalog.js';

export {
  createAppManifest,
  diffAppManifest,
  requirementAction,
  blocksApproval,
  pendingRequirements,
  isToolExposed,
  exposedTools,
  disabledNativeCommands,
} from './app-manifest.js';
export type {
  AppCapability,
  AppManifest,
  AppManifestDiff,
  AppManifestSeed,
  AppManifestSeedResult,
  AppNativeToolPolicy,
  AppObjectType,
  AppRequirement,
  AppRequirementResolution,
  AppRequirementState,
  AppRequirementTarget,
  AppRequirements,
  AppRequirementsPayload,
  AppSignal,
  AppToolExposure,
} from './app-manifest.js';

export { createCustomBrain } from './custom-brain.js';
export type {
  BrainHealth,
  BrainIngestItem,
  BrainIngestStatus,
  BrainQueryBody,
  BrainQueryItem,
  CustomBrain,
  CustomBrainHandlers,
} from './custom-brain.js';

export { createFallbackChat } from './fallback-chat.js';
export type {
  FallbackChat,
  FallbackChatOptions,
  FallbackCompletion,
  FallbackMessage,
} from './fallback-chat.js';

export {
  createBrowserCommandAllowlist,
  NEXUS_BROWSER_ALLOW_PREFIXES,
  NEXUS_BROWSER_DENY_EXACT,
  NEXUS_BROWSER_DENY_PREFIXES,
} from '../browser/command-allowlist.js';
export type {
  BrowserCommandAllowlist,
  BrowserCommandAllowlistOptions,
  BrowserCommandDecision,
} from '../browser/command-allowlist.js';

export { createClientConfigStore, mergeConfig } from '../client-config/store.js';
export type {
  ClientConfigLogger,
  ClientConfigSnapshot,
  ClientConfigStorage,
  ClientConfigStore,
  ClientConfigStoreOptions,
} from '../client-config/store.js';
