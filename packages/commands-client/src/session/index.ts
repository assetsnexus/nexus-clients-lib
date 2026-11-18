/**
 * `@nexus/commands-client/session` — the Nexus session and identity surface.
 *
 * A host app should not re-implement any of this: PKCE, the single-use state,
 * refresh/revoke with typed errors, the command send with one refresh retry,
 * the availability probe, and the identity level.
 *
 * ```ts
 * const sessions = createNexusSessionManager({
 *   issuer, clientId, clientSecret, redirectUri,
 *   store: myStore, // any get/set/delete
 * });
 *
 * const { authorizeUrl } = await sessions.startLogin({ subjectType: 'user' });
 * // … browser round-trip …
 * await sessions.completeLogin({ sessionId, code, state });
 * const view = await sessions.view(sessionId);       // level, org, app roles
 * const out = await sessions.sendCommand(sessionId, 'anx.communicate.conversations.list');
 * ```
 */
export { createNexusSessionManager } from './manager.js';
export { createNexusEventBus } from './events.js';
export type {
  NexusAppEvent,
  NexusEvent,
  NexusEventBus,
  NexusEventListener,
  NexusEventFilter,
  NexusSessionEvent,
} from './events.js';
export {
  accessExpiresAtFromClaims,
  buildSessionView,
  decodeAppTokenClaims,
  deriveIdentityLevel,
  safeReturnTo,
} from './identity.js';
export type { NexusAppTokenClaims } from './identity.js';
export {
  classifyNexusProbe,
  classifyTokenError,
  fallbackSelected,
  nexusErrorMessage,
  nexusGrantRequired,
  nexusOfflineCode,
  probeNexusAvailability,
  tokenError,
} from './errors.js';
export type { NexusProbeClient } from './errors.js';
export type {
  NexusAccessProbe,
  NexusCommandOutcome,
  NexusIdentityLevel,
  NexusLoginIntent,
  NexusSessionLogger,
  NexusSessionManager,
  NexusSessionManagerOptions,
  NexusSessionRecord,
  NexusSessionStore,
  NexusSessionView,
  NexusSubjectType,
  NexusTokenError,
  NexusTokenErrorCode,
  NexusTokenResult,
} from './types.js';
