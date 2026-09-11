import type { DataAccessApprovalPrompt } from './data-access.js';
import type { PermissionElevationPrompt } from './permission-elevation.js';

export type CommandEnvelope = {
  command: string;
  payload: Record<string, unknown>;
  requestId: string;
  traceId?: string;
  idempotencyKey?: string;
  identity?: Record<string, unknown>;
  responseExpected?: boolean;
};

export type CommandResponse = {
  responseCode: number;
  responseObject?: any;
  errorObjects?: Array<{
    code?: string;
    message?: string;
    details?: Record<string, any>;
  }>;
  message?: string;
  authRequestId?: string;
  requestId?: string;
};

export type RateLimitInfo = {
  limit?: number;
  remaining?: number;
  reset?: number;
  retryAfterSeconds?: number;
};

export type SendSuccess<T = unknown> = {
  ok: true;
  kind: 'ok';
  data: T;
  response: CommandResponse;
  requestId: string;
  traceId?: string;
  rateLimit?: RateLimitInfo;
};

export type ScaUiMetadata = {
  type?: 'password' | 'code' | 'biometric' | 'waiting' | 'automatic';
  instructions?: string;
  waitingMessage?: string;
  maskedChannel?: string;
  codeLength?: number;
  canResend?: boolean;
  authorizationText?: string;
  dynamicFields?: Array<{ label: string; value: string }>;
  dynamicFieldsHash?: string;
  contextLink?: { label: string; href: string; scope?: string };
};

export type LongRunningMode = 'poll' | 'push' | 'poll_push';

export type LongRunningTaskProgress = {
  percent?: number;
  step?: string;
  completed?: number;
  total?: number;
};

export type LongRunningTaskView = {
  taskId: string;
  command: string;
  status: string;
  mode: LongRunningMode;
  progress?: LongRunningTaskProgress;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
  cancelRequested?: boolean;
  channels?: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt: string;
  pollAfterMs?: number;
  jobId?: string;
  sessionId?: string;
};

export type SendAccepted<T = unknown> = {
  ok: true;
  kind: 'accepted';
  requestId: string;
  data: T;
  taskId?: string;
  jobId?: string;
  sessionId?: string;
  status?: string;
  mode?: LongRunningMode;
  statusCommand?: string;
  cancelCommand?: string;
  pollAfterMs?: number;
  expiresAt?: string;
  channels?: string[];
  progress?: LongRunningTaskProgress;
  response: CommandResponse;
  rateLimit?: RateLimitInfo;
};

export type WaitForTaskOptions = {
  pollAfterMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type SendScaRequired = {
  ok: false;
  kind: 'sca_required';
  requestId: string;
  authRequestId: string | null;
  authorizationText?: string;
  dynamicFields?: Record<string, unknown>;
  dynamicFieldsHash?: string;
  sentTo?: string;
  channelType?: string;
  authMethod?: string;
  uiMetadata?: ScaUiMetadata;
  error: { code?: string; message?: string };
  response: CommandResponse;
  rateLimit?: RateLimitInfo;
};

export type SendDataAccessRequired = {
  ok: false;
  kind: 'data_access_approval_required';
  requestId: string;
  dataAccessApproval: DataAccessApprovalPrompt;
  error: { code?: string; message?: string; details?: Record<string, any> };
  response?: CommandResponse;
  rateLimit?: RateLimitInfo;
};

export type SendPermissionElevationRequired = {
  ok: false;
  kind: 'permission_elevation_required';
  requestId: string;
  permissionElevation: PermissionElevationPrompt;
  error: { code?: string; message?: string; details?: Record<string, any> };
  response?: CommandResponse;
  rateLimit?: RateLimitInfo;
};

export type SendError = {
  ok: false;
  kind: 'error' | 'rate_limited';
  requestId: string;
  error: { code?: string; message?: string; details?: Record<string, any> };
  response?: CommandResponse;
  rateLimit?: RateLimitInfo;
};

export type SendResult<T = unknown> =
  | SendSuccess<T>
  | SendAccepted<T>
  | SendScaRequired
  | SendDataAccessRequired
  | SendPermissionElevationRequired
  | SendError;

export type SendOptions = {
  requestId?: string;
  traceId?: string;
  idempotencyKey?: string;
  /** When false, skip auto idempotency key for non-read commands. Default true. */
  autoIdempotency?: boolean;
  responseExpected?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  identity?: Record<string, unknown>;
  /** Treat as read (no auto idempotency). Auto-detected from command suffix when omitted. */
  isRead?: boolean;
  /** Internal: set after a single 401→refresh retry to prevent recursion. */
  _authRetried?: boolean;
};

export function isLikelyReadCommand(command: string): boolean {
  return /\.(get|list|find|search|stats|summary|preview|meta|schema|info|usage|calls|history)(\.|$)/i.test(
    command,
  );
}
