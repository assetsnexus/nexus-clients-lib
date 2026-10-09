import type { OutgoingQueueLogger, OutgoingQueueMetrics } from './outgoing-queue.metrics.js';
import type { OutgoingQueuedMessage } from './outgoing-queue.js';

export type OutgoingFlushSendResult = {
  ok: boolean;
  message?: string;
  code?: string;
  /** Fallback completion is not a Nexus delivery. */
  transport?: 'fallback' | string;
};

/**
 * Sends queued items on the Nexus path. Stops at the first real failure so a
 * down transport is not hammered. A fallback `ok` is not treated as delivered.
 */
export async function flushOutgoingMessages(opts: {
  items: OutgoingQueuedMessage[];
  send: (item: OutgoingQueuedMessage) => Promise<OutgoingFlushSendResult>;
  onSent: (item: OutgoingQueuedMessage) => void;
  onFailed: (item: OutgoingQueuedMessage, message: string) => void;
  metrics: OutgoingQueueMetrics;
  logger?: OutgoingQueueLogger;
  /** False after Cancel removed the item, so a flush already in flight does not send it. */
  shouldSend?: (item: OutgoingQueuedMessage) => boolean;
  reason: 'auto' | 'manual';
  threadKey: string;
}): Promise<'empty' | 'flushed' | 'failed'> {
  if (!opts.items.length) return 'empty';
  let flushed = 0;
  for (const item of opts.items) {
    if (opts.shouldSend && !opts.shouldSend(item)) continue;
    let result: OutgoingFlushSendResult;
    try {
      result = await opts.send(item);
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : 'Nexus could not be reached. Try again shortly.';
      opts.onFailed(item, message);
      opts.metrics.record('flush_failed');
      opts.logger?.warn?.('outgoing_queue_flush_failed', {
        threadKey: opts.threadKey,
        reason: opts.reason,
        code: 'exception',
      });
      if (flushed) opts.metrics.record('flushed', flushed);
      return 'failed';
    }
    if (result.ok && result.transport === 'fallback') {
      const message = 'Nexus could not be reached. Try again shortly.';
      opts.onFailed(item, message);
      opts.metrics.record('flush_failed');
      opts.logger?.warn?.('outgoing_queue_flush_rejected_fallback', {
        threadKey: opts.threadKey,
        reason: opts.reason,
      });
      if (flushed) opts.metrics.record('flushed', flushed);
      return 'failed';
    }
    if (result.ok) {
      opts.onSent(item);
      flushed += 1;
      continue;
    }
    const message = result.message?.trim() || 'Nexus could not be reached. Try again shortly.';
    opts.onFailed(item, message);
    opts.metrics.record('flush_failed');
    opts.logger?.warn?.('outgoing_queue_flush_failed', {
      threadKey: opts.threadKey,
      reason: opts.reason,
      code: result.code || 'error',
    });
    if (flushed) opts.metrics.record('flushed', flushed);
    return 'failed';
  }
  if (!flushed) return 'empty';
  opts.metrics.record('flushed', flushed);
  opts.logger?.info?.('outgoing_queue_flushed', { threadKey: opts.threadKey, reason: opts.reason, count: flushed });
  return 'flushed';
}
