import type { CommandClient, SendResult } from './index.js';

const TERMINAL_STATUSES = new Set([
  'completed',
  'complete',
  'succeeded',
  'success',
  'failed',
  'error',
  'cancelled',
  'canceled',
]);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Polling aborted'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  if (r.response && typeof r.response === 'object') {
    const response = r.response as Record<string, unknown>;
    if (response.responseObject && typeof response.responseObject === 'object') {
      return response.responseObject as Record<string, unknown>;
    }
  }
  return r;
}

export type WorkloadPollOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  requestId?: string;
  signal?: AbortSignal;
};

export async function pollWorkload(
  client: CommandClient,
  workloadId: string,
  opts: WorkloadPollOptions = {},
): Promise<Record<string, unknown>> {
  const intervalMs = Math.max(250, opts.intervalMs ?? 1200);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 60);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = (await client.send(
      'anx.inference.workloads.get',
      { workloadId },
      { requestId: opts.requestId },
    )) as SendResult | unknown;

    if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
      const failure = result as Extract<SendResult, { ok: false }>;
      throw new Error(failure.message || `workload.get failed: ${failure.kind}`);
    }

    const data = unwrapData(result);
    const status = String(data.status || data.state || '').toLowerCase();
    if (TERMINAL_STATUSES.has(status)) {
      return data;
    }
    if (attempt < maxAttempts) {
      await sleep(intervalMs, opts.signal);
    }
  }

  throw new Error(`Timed out waiting for workload ${workloadId}`);
}
