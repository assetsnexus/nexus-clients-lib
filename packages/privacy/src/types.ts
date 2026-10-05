export type PrivacyRequestType = 'access' | 'erasure' | 'rectification' | 'restriction' | 'objection';

export type PrivacyJobStatus = 'queued' | 'review' | 'completed' | 'cancelled' | 'failed';

export interface RetainedCategory {
  category: string;
  legalBasis: string;
}

export interface EraseResult {
  deleted: number;
  anonymised: number;
  retained: RetainedCategory[];
}

export interface PrivacySectionContext {
  requestId: string;
  sub: string;
  grantId: string;
  type: PrivacyRequestType | 'account_erased';
}

export interface PrivacySection {
  id: string;
  export?: (ctx: PrivacySectionContext) => Promise<unknown> | unknown;
  erase?: (ctx: PrivacySectionContext) => Promise<EraseResult> | EraseResult;
}

export interface PrivacyReviewOutcome {
  outcome: 'fulfilled' | 'rejected';
  summary?: string;
  rejectionReason?: string;
  legalBasis?: string;
}

export interface PrivacyJob {
  requestId: string;
  eventId: string;
  kind: 'privacy_request.created' | 'privacy_request.cancelled' | 'account.erased';
  type: PrivacyRequestType | 'account_erased';
  sub: string;
  grantId: string;
  details?: string;
  dueAt?: string;
  grantIds?: string[];
  subs?: string[];
  status: PrivacyJobStatus;
  attempts: number;
  nextAttemptAt: string;
  leaseUntil?: string | null;
  leaseOwner?: string | null;
  lastError?: string;
  review?: PrivacyReviewOutcome;
  acknowledged?: boolean;
  updatedAt: string;
}

export interface PrivacyJobStore {
  enqueue(job: PrivacyJob): Promise<'inserted' | 'exists'>;
  get(requestId: string): Promise<PrivacyJob | null>;
  /** Open jobs whose lease has expired and whose next attempt is due. */
  lease(nowIso: string, owner: string, leaseMs: number, limit: number): Promise<PrivacyJob[]>;
  save(job: PrivacyJob): Promise<void>;
  /** Mark an existing job cancelled. Returns false when no row exists. */
  cancel(requestId: string, nowIso: string): Promise<boolean>;
}

export interface PrivacyCommandClient {
  privacyRequests: {
    list(options?: { cursor?: string; limit?: number }): Promise<{
      items: Array<{ requestId: string; type: PrivacyRequestType; sub: string; grantId: string; details?: string; dueAt: string }>;
      nextCursor?: string | null;
    }>;
    get?(requestId: string): Promise<{ status: string; outcome?: 'fulfilled' | 'rejected' | null }>;
    acknowledge(requestId: string): Promise<unknown>;
    exportUploadUrl(input: {
      requestId: string;
      contentType: string;
      contentLength: number;
      sha256: string;
    }): Promise<{ uploadUrl: string; headers?: Record<string, string> }>;
    complete(input: {
      requestId: string;
      outcome: 'fulfilled' | 'rejected';
      summary?: string;
      rejectionReason?: string;
      legalBasis?: string;
      retainedCategories?: RetainedCategory[];
    }): Promise<unknown>;
  };
}

export interface PrivacyLogger {
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface PrivacyMetrics {
  counter?(name: string, labels: Record<string, string>, value?: number): void;
  histogram?(name: string, labels: Record<string, string>, value: number): void;
}

export interface PrivacyKitOptions {
  client: PrivacyCommandClient;
  store: PrivacyJobStore;
  sections: PrivacySectionRegistry;
  onReview?: (job: PrivacyJob) => Promise<void> | void;
  logger?: PrivacyLogger;
  metrics?: PrivacyMetrics;
  putExport?: (url: string, body: Uint8Array, headers: Record<string, string>) => Promise<{ status: number }>;
  now?: () => Date;
  leaseMs?: number;
}

export interface PrivacySectionRegistry {
  register(section: PrivacySection): void;
  ids(): string[];
  list(): PrivacySection[];
}
