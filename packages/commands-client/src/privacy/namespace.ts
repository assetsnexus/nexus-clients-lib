import type { NexusClient } from '../client.js';
import type { SendResult } from '../types.js';

export type PrivacyRequestType = 'access' | 'erasure' | 'rectification' | 'restriction' | 'objection';

export type PrivacyRequestView = {
  requestId: string;
  clientId: string;
  grantId: string;
  sub: string;
  type: PrivacyRequestType;
  status: string;
  dueAt: string;
  extendedUntil?: string | null;
  overdue?: boolean;
  details?: string;
  outcome?: 'fulfilled' | 'rejected' | null;
  summary?: string | null;
  exportReady?: boolean;
  history?: Array<{ at: string; actor: string; action: string; note?: string }>;
};

export type PrivacyExportUpload = {
  requestId: string;
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  expiresInSeconds: number;
  headers: Record<string, string>;
};

export type PrivacyCompleteInput = {
  requestId: string;
  outcome: 'fulfilled' | 'rejected';
  summary?: string;
  rejectionReason?: string;
  legalBasis?: string;
  retainedCategories?: Array<{ category: string; legalBasis: string }>;
};

export class PrivacyCommandError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(error: { code?: string; message?: string; details?: Record<string, unknown> }, httpStatus = 400) {
    super(error.message || error.code || 'privacy command failed');
    this.name = 'PrivacyCommandError';
    this.code = error.code || 'PRIVACY_COMMAND_FAILED';
    this.httpStatus = httpStatus;
    this.details = error.details;
  }
}

async function unwrap<T>(pending: Promise<SendResult<T>>): Promise<T> {
  const res = await pending;
  if (!res.ok) {
    const httpStatus = 'response' in res && res.response?.responseCode ? res.response.responseCode : 400;
    throw new PrivacyCommandError(res.error || {}, httpStatus);
  }
  return res.data;
}

/** Partner (app client-credentials) privacy-request commands. Scoped to the caller client. */
export class PrivacyRequestsNamespace {
  constructor(private client: NexusClient) {}

  async list(options: { cursor?: string; limit?: number } = {}): Promise<{
    items: PrivacyRequestView[];
    nextCursor: string | null;
    limit?: number;
  }> {
    const payload: Record<string, unknown> = {};
    if (options.cursor) payload.cursor = options.cursor;
    if (options.limit != null) payload.limit = options.limit;
    const data = await unwrap(this.client.send<{ items?: PrivacyRequestView[]; nextCursor?: string | null; limit?: number }>(
      'anx.oauth2.privacy.request.partner.list',
      payload,
      { isRead: true },
    ));
    return { items: data.items || [], nextCursor: data.nextCursor ?? null, limit: data.limit };
  }

  get(requestId: string): Promise<PrivacyRequestView> {
    if (!requestId.trim()) throw new PrivacyCommandError({ code: 'INVALID_INPUT', message: 'requestId is required' }, 400);
    return unwrap(this.client.send('anx.oauth2.privacy.request.partner.get', { requestId }, { isRead: true }));
  }

  acknowledge(requestId: string): Promise<PrivacyRequestView> {
    return unwrap(this.client.send('anx.oauth2.privacy.request.acknowledge', { requestId }));
  }

  extend(requestId: string, months: 1 | 2, extensionReason: string): Promise<PrivacyRequestView> {
    return unwrap(this.client.send('anx.oauth2.privacy.request.extend', { requestId, months, extensionReason }));
  }

  exportUploadUrl(input: {
    requestId: string;
    contentType: string;
    contentLength: number;
    sha256: string;
  }): Promise<PrivacyExportUpload> {
    return unwrap(this.client.send('anx.oauth2.privacy.request.export.upload-url', input));
  }

  complete(input: PrivacyCompleteInput): Promise<PrivacyRequestView> {
    return unwrap(this.client.send('anx.oauth2.privacy.request.complete', input));
  }
}
