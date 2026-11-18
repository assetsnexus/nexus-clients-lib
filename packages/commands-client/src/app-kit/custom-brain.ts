/**
 * `custom_http` brain contract, app side.
 *
 * The region's `CustomHttpAdapter` calls four endpoints. The contract is small
 * on purpose: the partner owns its store, Nexus only reads and (when an ingest
 * path is configured) writes.
 *
 *   GET  <base>/health                      -> { healthy, readyForIngestion }
 *   POST <base>/query   {query,topK,...}    -> { items: [{id,text,score,metadata}] }
 *   POST <base>/ingest  {items:[...]}       -> { batchId }
 *   GET  <base>/ingest/status?batchId=...   -> { status, processedCount, totalCount }
 *
 * Ingest is asynchronous by contract: acknowledge a batch id, then report
 * progress. A synchronous "indexed" reply would be a claim the region cannot
 * verify.
 */

export type BrainQueryBody = {
  query?: string;
  topK?: number;
  filters?: Record<string, unknown>;
  scopes?: string[];
};

export type BrainQueryItem = {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type BrainIngestItem = {
  externalId: string;
  text: string;
  type: 'memory' | 'knowledge';
  metadata?: Record<string, unknown>;
};

export type BrainIngestStatus = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processedCount: number;
  totalCount: number;
  errors?: string[];
};

export type BrainHealth = {
  healthy: boolean;
  readyForIngestion: boolean;
  version?: string;
  error?: string;
};

export type CustomBrainHandlers = {
  /** Search the store. */
  query: (body: BrainQueryBody) => { items: BrainQueryItem[] } | Promise<{ items: BrainQueryItem[] }>;
  /** Accept a batch. Optional: without it the brain is read-only. */
  ingest?: (body: { items: BrainIngestItem[]; database?: string | null }) =>
    | { batchId: string }
    | Promise<{ batchId: string }>;
  /** Report progress for a batch. Required when `ingest` is set. */
  ingestStatus?: (batchId: string) => BrainIngestStatus | null | Promise<BrainIngestStatus | null>;
  /** Optional health override; the default reports healthy. */
  health?: () => BrainHealth;
};

export type CustomBrain = {
  health: () => BrainHealth;
  query: (body: BrainQueryBody) => Promise<{ items: BrainQueryItem[] }>;
  ingest: (body: { items?: BrainIngestItem[]; database?: string | null }) => Promise<{ batchId: string }>;
  ingestStatus: (batchId: string) => Promise<BrainIngestStatus | null>;
  /** True when an ingest handler is configured. */
  writable: boolean;
};

export function createCustomBrain(handlers: CustomBrainHandlers): CustomBrain {
  const writable = typeof handlers.ingest === 'function';

  return {
    writable,
    health() {
      if (handlers.health) return handlers.health();
      return { healthy: true, readyForIngestion: writable };
    },
    async query(body) {
      const result = await handlers.query(body || {});
      return { items: Array.isArray(result?.items) ? result.items : [] };
    },
    async ingest(body) {
      if (!handlers.ingest) {
        throw Object.assign(new Error('custom_http is a read-only brain: ingest is not configured'), {
          code: 'BRAIN_READ_ONLY',
        });
      }
      const items = Array.isArray(body?.items) ? body.items : [];
      return handlers.ingest({ items, database: body?.database ?? null });
    },
    async ingestStatus(batchId) {
      if (!handlers.ingestStatus) return null;
      return handlers.ingestStatus(batchId);
    },
  };
}
