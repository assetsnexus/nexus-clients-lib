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

async function unwrap<T>(pending: Promise<SendResult<T>>): Promise<T> {
  const res = await pending;
  if (!res.ok) throw new Error(res.error?.message || 'privacy command failed');
  return res.data;
}

/** Partner (app client-credentials) privacy-request commands. Scoped to the caller client. */
export class PrivacyRequestsNamespace {
  constructor(private client: NexusClient) {}

  async list(): Promise<{ items: PrivacyRequestView[] }> {
    const data = await unwrap(this.client.send<{ items?: PrivacyRequestView[] }>(
      'anx.oauth2.privacy.request.partner.list',
      {},
      { isRead: true },
    ));
    return { items: data.items || [] };
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
