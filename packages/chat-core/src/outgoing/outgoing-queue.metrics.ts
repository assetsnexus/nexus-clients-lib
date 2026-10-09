/** Labelled counter for outgoing-queue outcomes. Hosts may mirror `snapshot()` into Prometheus. */

export const OUTGOING_QUEUE_METRIC = 'anx_chat_outgoing_queue_total';

export const OUTGOING_QUEUE_OUTCOMES = ['enqueued', 'flushed', 'cancelled', 'flush_failed'] as const;

export type OutgoingQueueOutcome = (typeof OUTGOING_QUEUE_OUTCOMES)[number];

export type OutgoingQueueLogger = {
  info?: (message: string, extra?: Record<string, unknown>) => void;
  warn?: (message: string, extra?: Record<string, unknown>) => void;
};

export type OutgoingQueueMetrics = {
  record: (outcome: OutgoingQueueOutcome, value?: number) => void;
  snapshot: () => Record<OutgoingQueueOutcome, number>;
};

function isOutcome(value: string): value is OutgoingQueueOutcome {
  return (OUTGOING_QUEUE_OUTCOMES as readonly string[]).includes(value);
}

export function createOutgoingQueueMetrics(opts?: {
  logger?: OutgoingQueueLogger;
  /** Optional Prometheus-style counter. The in-process snapshot is always updated. */
  counter?: { inc: (labels: { outcome: string }, value?: number) => void };
}): OutgoingQueueMetrics {
  const totals: Record<OutgoingQueueOutcome, number> = {
    enqueued: 0,
    flushed: 0,
    cancelled: 0,
    flush_failed: 0,
  };
  return {
    record(outcome, value = 1) {
      if (!isOutcome(outcome) || !Number.isInteger(value) || value < 1) {
        opts?.logger?.warn?.('outgoing_queue_metric_rejected', { outcome, value });
        return;
      }
      totals[outcome] += value;
      try {
        opts?.counter?.inc({ outcome }, value);
      } catch (err) {
        opts?.logger?.warn?.('outgoing_queue_metric_failed', {
          outcome,
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
      const extra = { outcome, value, total: totals[outcome] };
      if (outcome === 'flush_failed') opts?.logger?.warn?.(OUTGOING_QUEUE_METRIC, extra);
      else opts?.logger?.info?.(OUTGOING_QUEUE_METRIC, extra);
    },
    snapshot() {
      return { ...totals };
    },
  };
}
