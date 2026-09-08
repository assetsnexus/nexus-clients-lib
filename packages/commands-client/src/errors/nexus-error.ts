export type NexusErrorCode =
  | 'TRANSPORT_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SCA_REQUIRED'
  | 'DATA_ACCESS_APPROVAL_REQUIRED'
  | 'INVALID_GRANT'
  | 'INVALID_CLIENT'
  | 'REGION_NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN';

export type NexusErrorCatalogEntry = {
  code: NexusErrorCode;
  httpStatus: number;
  retryable: boolean;
  meaning: string;
  remediation: string;
  docsAnchor: string;
};

/** Partner-visible error catalog — must stay aligned with region oauth2-contract. */
export const NEXUS_ERROR_CATALOG: Record<NexusErrorCode, NexusErrorCatalogEntry> = {
  TRANSPORT_ERROR: {
    code: 'TRANSPORT_ERROR',
    httpStatus: 0,
    retryable: true,
    meaning: 'Network or TLS failure talking to the region.',
    remediation: 'Retry with backoff; check connectivity and region URL.',
    docsAnchor: 'errors#transport_error',
  },
  TIMEOUT: {
    code: 'TIMEOUT',
    httpStatus: 408,
    retryable: true,
    meaning: 'Request exceeded the client timeout.',
    remediation: 'Retry with the same idempotencyKey for writes.',
    docsAnchor: 'errors#timeout',
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    httpStatus: 429,
    retryable: true,
    meaning: 'Client or grant rate limit exhausted.',
    remediation: 'Honour Retry-After and X-Nexus-RateLimit-* headers.',
    docsAnchor: 'errors#rate_limited',
  },
  INVALID_RESPONSE: {
    code: 'INVALID_RESPONSE',
    httpStatus: 502,
    retryable: true,
    meaning: 'Region returned a body the client could not parse.',
    remediation: 'Retry once; report with traceId if persistent.',
    docsAnchor: 'errors#invalid_response',
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    httpStatus: 401,
    retryable: false,
    meaning: 'Missing or invalid credentials / token.',
    remediation: 'Refresh the token or re-run Login with Nexus.',
    docsAnchor: 'errors#unauthorized',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    httpStatus: 403,
    retryable: false,
    meaning: 'Authenticated but not allowed for this command.',
    remediation: 'Check grant allowlist and RBAC; request additional scopes.',
    docsAnchor: 'errors#forbidden',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    meaning: 'Command or resource does not exist.',
    remediation: 'Verify command name against GET /commands.',
    docsAnchor: 'errors#not_found',
  },
  SCA_REQUIRED: {
    code: 'SCA_REQUIRED',
    httpStatus: 202,
    retryable: false,
    meaning: 'Strong customer authentication required before the command can complete.',
    remediation: 'Visualize authorizationText next to the factor, call anx.security.auth.verify-2fa, then retry the original command with the same requestId.',
    docsAnchor: 'errors#sca_required',
  },
  DATA_ACCESS_APPROVAL_REQUIRED: {
    code: 'DATA_ACCESS_APPROVAL_REQUIRED',
    httpStatus: 403,
    retryable: false,
    meaning: 'User must approve data access for this resource.',
    remediation: 'Surface the approval prompt; retry after the user decides.',
    docsAnchor: 'errors#data_access_approval_required',
  },
  INVALID_GRANT: {
    code: 'INVALID_GRANT',
    httpStatus: 400,
    retryable: false,
    meaning: 'OAuth grant is inactive, expired, or revoked.',
    remediation: 'Re-run the authorization code flow.',
    docsAnchor: 'errors#invalid_grant',
  },
  INVALID_CLIENT: {
    code: 'INVALID_CLIENT',
    httpStatus: 401,
    retryable: false,
    meaning: 'Client authentication failed.',
    remediation: 'Check client_id / client_secret; rotate if compromised.',
    docsAnchor: 'errors#invalid_client',
  },
  REGION_NOT_FOUND: {
    code: 'REGION_NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    meaning: 'No region matched the resolver query.',
    remediation: 'Ask the user to pick a country/region or update the static index.',
    docsAnchor: 'errors#region_not_found',
  },
  NOT_IMPLEMENTED: {
    code: 'NOT_IMPLEMENTED',
    httpStatus: 501,
    retryable: false,
    meaning: 'Feature is declared but not available yet (e.g. gateway discovery).',
    remediation: 'Use StaticRegionIndex or CountryRegionResolver instead.',
    docsAnchor: 'errors#not_implemented',
  },
  UNKNOWN: {
    code: 'UNKNOWN',
    httpStatus: 500,
    retryable: false,
    meaning: 'Unclassified error.',
    remediation: 'Inspect response.errorObjects and contact support with traceId.',
    docsAnchor: 'errors#unknown',
  },
};

export class NexusError extends Error {
  readonly code: NexusErrorCode;
  readonly retryable: boolean;
  readonly docsUrl: string;
  readonly httpStatus: number;
  readonly cause?: unknown;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: NexusErrorCode,
    message?: string,
    opts?: { cause?: unknown; meta?: Record<string, unknown>; docsBaseUrl?: string },
  ) {
    const entry = NEXUS_ERROR_CATALOG[code] ?? NEXUS_ERROR_CATALOG.UNKNOWN;
    super(message || entry.meaning);
    this.name = 'NexusError';
    this.code = entry.code;
    this.retryable = entry.retryable;
    this.httpStatus = entry.httpStatus;
    this.docsUrl = `${opts?.docsBaseUrl || 'https://docs.assetsnexus.org/developers'}/${entry.docsAnchor}`;
    this.cause = opts?.cause;
    this.meta = opts?.meta;
  }
}

export function mapHttpStatusToCode(status: number): NexusErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'TRANSPORT_ERROR';
  return 'UNKNOWN';
}
