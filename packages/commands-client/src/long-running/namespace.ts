import type { NexusClient } from '../client.js';
import { NexusError } from '../errors/nexus-error.js';
import type {
  LongRunningTaskView,
  SendAccepted,
  SendOptions,
  SendResult,
  WaitForTaskOptions,
} from '../types.js';

const GET = 'anx.long-running.get';
const LIST = 'anx.long-running.list';
const CANCEL = 'anx.long-running.cancel';
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'expired']);

export class LongRunningNamespace {
  constructor(private readonly client: NexusClient) {}

  async list(payload: {
    status?: string;
    command?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<SendResult<{ items: LongRunningTaskView[]; total: number; nextCursor?: string }>> {
    return this.client.send(LIST, payload);
  }

  async get(taskId: string): Promise<SendResult<{ task: LongRunningTaskView }>> {
    return this.client.send(GET, { taskId });
  }

  async cancel(taskId: string): Promise<SendResult<{ task: LongRunningTaskView }>> {
    return this.client.send(CANCEL, { taskId });
  }

  async waitForTask(taskId: string, options: WaitForTaskOptions = {}): Promise<LongRunningTaskView> {
    const started = Date.now();
    let delay = Math.max(0, options.pollAfterMs ?? 1000);
    while (true) {
      if (options.signal?.aborted) {
        throw new NexusError('TIMEOUT', 'waitForTask aborted');
      }
      if (options.timeoutMs && Date.now() - started > options.timeoutMs) {
        throw new NexusError('TIMEOUT', `waitForTask timed out after ${options.timeoutMs}ms`);
      }
      const res = await this.get(taskId);
      if (!res.ok) {
        throw new NexusError(res.error.code || 'UNKNOWN', res.error.message || 'anx.long-running.get failed');
      }
      const task = res.kind === 'ok' ? res.data.task : undefined;
      if (task && TERMINAL.has(task.status)) return task;
      if (task?.pollAfterMs != null) delay = task.pollAfterMs;
      await sleep(delay, options.signal);
    }
  }

  async sendAndWait<T = unknown>(
    command: string,
    payload: Record<string, unknown>,
    options?: SendOptions & WaitForTaskOptions,
  ): Promise<SendResult<T> | { ok: true; kind: 'accepted'; task: LongRunningTaskView; requestId: string }> {
    const start = await this.client.send<T>(command, payload, options);
    if (!(start.ok && start.kind === 'accepted' && start.taskId)) return start;
    const task = await this.waitForTask(start.taskId, {
      pollAfterMs: start.pollAfterMs ?? options?.pollAfterMs,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
    return { ok: true, kind: 'accepted', task, requestId: start.requestId };
  }
}

export function isAcceptedResult<T>(result: SendResult<T>): result is SendAccepted<T> {
  return result.ok && result.kind === 'accepted';
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new NexusError('TIMEOUT', 'Aborted'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new NexusError('TIMEOUT', 'Aborted'));
      },
      { once: true },
    );
  });
}
