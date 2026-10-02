export { NexusClient, type NexusClientOptions, type Transport } from './client.js';
export {
  mapDataAccessApprovalError,
  type DataAccessApprovalPrompt,
} from './data-access.js';
export {
  mapPermissionElevationError,
  type PermissionElevationPrompt,
} from './permission-elevation.js';
export {
  ElevationRequiredError,
  type PermissionRequestSnapshot,
  type PermissionRequestStatus,
  type CommandSender,
} from './permissions/elevation-error.js';
export {
  PermissionsNamespace,
  type PermissionBatchResult,
} from './permissions/namespace.js';
export {
  PermissionBatchValidationError,
  normalizePermissionBatch,
  type PermissionBatchItem,
  type PermissionResourceRef,
} from './permissions/validate-batch.js';
export {
  SubjectNamespace,
  SubjectFieldsNamespace,
} from './subject/namespace.js';
export { verifyAttestation, type AttestationLogger, type JwksKeySource } from './subject/attestation.js';
export {
  FieldClaimValidationError,
  isCatalogField,
  normalizeFieldRequest,
} from './subject/field-catalog.js';
export type {
  AuthorizeRequirements,
  CatalogGroup,
  DataAccessMode,
  DefaultSubjectType,
  FieldOmittedReason,
  FieldRequestItem,
  FieldsGetResult,
  FieldsRequestResult,
  LoginRequirements,
  MinVerificationLevel,
  RegulatoryAttestationClaims,
  RegulatoryStatusKind,
  RegulatoryStatusResult,
  RegulatoryStatusRow,
  RegulatoryStatusTarget,
  RegulatoryStatusValue,
  RequirementAction,
  RequirementBundle,
  SubjectIdentitiesResult,
  SubjectIdentity,
} from './subject/types.js';
export {
  NexusError,
  NEXUS_ERROR_CATALOG,
  mapHttpStatusToCode,
  type NexusErrorCode,
  type NexusErrorCatalogEntry,
} from './errors/nexus-error.js';
export {
  StaticTokenProvider,
  BearerTokenProvider,
  type TokenProvider,
  type IdentityContext,
} from './token-provider.js';
export {
  StaticRegionIndex,
  CountryRegionResolver,
  GatewayRegionResolver,
  type RegionResolver,
  type RegionPublicEndpoints,
} from './regions/resolvers.js';
export {
  generatePkce,
  generateOAuthState,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  introspectToken,
  fetchUserInfo,
  revokeToken,
  fetchDiscovery,
  JwksCache,
  ID_TOKEN_CLOCK_SKEW_SECONDS,
  type PkcePair,
  type AuthorizeUrlParams,
  type TokenResponse,
  type IntrospectionResponse,
} from './oauth/helpers.js';
export { GrantNamespace, type GrantView, type EffectiveCapability } from './grant/namespace.js';
export { SubscriptionsNamespace } from './subscriptions/namespace.js';
export {
  DiscoveryNamespace,
  type CatalogMeta,
  type CommandDescriptor,
} from './discovery/namespace.js';
export {
  type SendResult,
  type SendAccepted,
  type SendPermissionElevationRequired,
  type SendOptions,
  type CommandResponse,
  type RateLimitInfo,
  type ScaUiMetadata,
  type LongRunningTaskView,
  type LongRunningMode,
  type WaitForTaskOptions,
  isLikelyReadCommand,
} from './types.js';
export { LongRunningNamespace, isAcceptedResult } from './long-running/namespace.js';
export {
  createRequestId,
  createIdempotencyKey,
  redactForLog,
  type Logger,
} from './utils.js';
export {
  isTransportDisconnect,
  isTransportDisconnectFromAxios,
  SHORT_TIMEOUT_DISCONNECT_MS,
  computeRetryDelaysMs,
  sleepMs,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_WINDOW_MS,
  CommandConnectivityController,
  formatConnectivityTooltip,
  type TransportDisconnectInput,
  type RetryScheduleOptions,
  type CommandConnectivityOptions,
  type ConnectivitySnapshot,
  type ConnectivityState,
  type WrapOptions,
} from './connectivity/index.js';
export {
  scoreRoute,
  defaultKindWeight,
  normalizeCandidate,
  resolveRoutes,
  pickBestRoute,
  mdnsEndpointToLanCandidate,
  mergeLanMdnsCandidates,
  RouteMonitor,
  pickRedundantRoutes,
  DEFAULT_COMMAND_REDUNDANCY,
  type RouteKind,
  type RouteCandidateInput,
  type ResolvedRoute,
  type RouteRole,
  type ProbeResult,
  type RouteProbeFn,
  type RouteMonitorInput,
  type RouteQosSnapshot,
  type CommandRedundancyConfig,
  type RouteMonitorClock,
  type RouteMonitorOptions,
} from './transports/index.js';