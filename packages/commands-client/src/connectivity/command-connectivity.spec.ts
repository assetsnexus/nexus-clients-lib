import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommandConnectivityController,
  formatConnectivityTooltip,
} from './command-connectivity.js';
import { isTransportDisconnect } from './is-transport-disconnect.js';
import { computeRetryDelaysMs } from './retry-schedule.js';

describe('isTransportDisconnect', () => {
  it('treats connection refused / network error as disconnect', () => {
    expect(
      isTransportDisconnect({
        error: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' },
      }),
    ).toBe(true);
    expect(
      isTransportDisconnect({ error: { message: 'Network Error' } }),
    ).toBe(true);
    expect(
      isTransportDisconnect({ error: { message: 'Failed to fetch' } }),
    ).toBe(true);
  });

  it('does not treat HTTP responses as disconnect', () => {
    expect(
      isTransportDisconnect({
        error: { response: { status: 500 }, message: 'Request failed' },
      }),
    ).toBe(false);
    expect(
      isTransportDisconnect({
        error: { response: { status: 401 }, code: 'ERR_BAD_REQUEST' },
      }),
    ).toBe(false);
  });

  it('does not treat long command timeout as disconnect', () => {
    expect(
      isTransportDisconnect({
        error: { code: 'ECONNABORTED', message: 'timeout of 300000ms exceeded' },
        requestTimeoutMs: 300_000,
      }),
    ).toBe(false);
  });

  it('treats short health timeout as disconnect', () => {
    expect(
      isTransportDisconnect({
        error: { code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' },
        requestTimeoutMs: 5_000,
      }),
    ).toBe(true);
  });

  it('treats offline navigator as disconnect', () => {
    expect(
      isTransportDisconnect({
        error: { message: 'anything' },
        online: false,
      }),
    ).toBe(true);
  });
});

describe('computeRetryDelaysMs', () => {
  it('spreads 3 attempts over 10s with zero jitter (2 gaps × 5s)', () => {
    const delays = computeRetryDelaysMs({
      maxAttempts: 3,
      windowMs: 10_000,
      jitterFactor: 0,
      random: () => 0.5,
    });
    expect(delays).toEqual([5000, 5000]);
  });
});

describe('CommandConnectivityController', () => {
  let now = 0;
  let sleepCalls: number[] = [];

  beforeEach(() => {
    now = 0;
    sleepCalls = [];
  });

  function createController(
    overrides: Partial<ConstructorParameters<typeof CommandConnectivityController>[0]> = {},
  ) {
    return new CommandConnectivityController({
      now: () => now,
      sleep: async (ms) => {
        sleepCalls.push(ms);
        now += ms;
      },
      random: () => 0.5,
      healthProbe: async () => {
        throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      },
      isAuthenticated: () => true,
      probeIntervalMs: 60_000,
      ...overrides,
    });
  }

  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('retries 3 times over ~10s and succeeds on 2nd attempt without down', async () => {
    const ctrl = createController();
    let calls = 0;
    const p = ctrl.wrap(
      async () => {
        calls += 1;
        if (calls < 2) {
          throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        }
        return { ok: true };
      },
      { command: 'anx.user.get', payload: {} },
    );

    const result = await p;
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(ctrl.getSnapshot().state).toBe('ok');
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(3000);
    ctrl.destroy();
  });

  it('does not enqueue HTTP 500', async () => {
    const ctrl = createController();
    await expect(
      ctrl.wrap(
        async () => {
          throw Object.assign(new Error('fail'), { response: { status: 500 } });
        },
        { command: 'anx.user.get' },
      ),
    ).rejects.toMatchObject({ response: { status: 500 } });
    expect(ctrl.getSnapshot().queuedCount).toBe(0);
    expect(ctrl.getSnapshot().state).toBe('ok');
    ctrl.destroy();
  });

  it('does not treat long timeout as disconnect', async () => {
    const ctrl = createController();
    await expect(
      ctrl.wrap(
        async () => {
          throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
        },
        { command: 'anx.inference.workloads.list', requestTimeoutMs: 300_000 },
      ),
    ).rejects.toBeTruthy();
    expect(ctrl.getSnapshot().state).toBe('ok');
    ctrl.destroy();
  });

  it('logged-in: promotes to down only after 20s', async () => {
    const downs: boolean[] = [];
    const ctrl = createController({
      onDownChange: (d) => downs.push(d),
      // Hold retries so we can inspect degraded without exhausting attempts
      sleep: async (ms, signal) => {
        sleepCalls.push(ms);
        // park until destroyed — use a never-resolving wait gated by advancing now externally
        await new Promise<void>((resolve, reject) => {
          const check = setInterval(() => {
            if (signal?.aborted) {
              clearInterval(check);
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            }
          }, 10);
          // Tests advance by resolving via destroy; keep parked briefly then resolve once
          setTimeout(() => {
            clearInterval(check);
            now += ms;
            resolve();
          }, 50);
        });
      },
    });

    const p = ctrl
      .wrap(
        async () => {
          throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        },
        { command: 'anx.user.get' },
      )
      .catch((e) => e);

    await flushMicrotasks();
    expect(ctrl.getSnapshot().state).toBe('degraded');

    now = 19_000;
    ctrl.reportTransportFailure(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    );
    expect(ctrl.getSnapshot().state).toBe('degraded');

    now = 20_000;
    ctrl.reportTransportFailure(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    );
    expect(ctrl.getSnapshot().state).toBe('down');
    expect(downs).toContain(true);

    ctrl.destroy();
    await p;
  });

  it('anonymous: down after retries exhausted (~10s path)', async () => {
    const ctrl = createController({
      isAuthenticated: () => false,
      maxAttempts: 3,
      retryWindowMs: 10_000,
    });

    let calls = 0;
    const p = ctrl
      .wrap(
        async () => {
          calls += 1;
          throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        },
        { command: 'anx.user.login', payload: { email: 'a' } },
      )
      .catch((e) => e);

    const err = await p;
    expect(err.isBackendDown).toBe(true);
    expect(calls).toBe(3);
    expect(ctrl.getSnapshot().state).toBe('down');
    ctrl.destroy();
  });

  it('queueVisible only after 1s', async () => {
    const ctrl = createController({
      sleep: async () => {
        // park — do not complete retries during this assertion
        await new Promise(() => {});
      },
    });
    const hang = ctrl
      .wrap(
        async () => {
          throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        },
        { command: 'anx.user.get', payload: { id: 1 } },
      )
      .catch(() => null);

    await flushMicrotasks();
    expect(ctrl.getSnapshot().queueVisible).toBe(false);
    expect(ctrl.getSnapshot().queuedCount).toBe(1);

    now = 1_001;
    ctrl.reportTransportFailure(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    );
    expect(ctrl.getSnapshot().queueVisible).toBe(true);

    ctrl.destroy();
    await hang;
  });

  it('coalesces duplicate reads while queued', async () => {
    let fail = true;
    let releaseSleep = (): void => {
      throw new Error('sleep was not armed');
    };
    const ctrl = createController({
      sleep: () =>
        new Promise<void>((resolve) => {
          releaseSleep = () => {
            fail = false;
            resolve();
          };
        }),
    });
    const run = async () => {
      if (fail) {
        throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
      }
      return { ok: true };
    };

    const p1 = ctrl.wrap(run, { command: 'anx.user.get', payload: { a: 1 } });
    await flushMicrotasks();
    expect(ctrl.getSnapshot().queuedCount).toBe(1);

    const p2 = ctrl.wrap(run, { command: 'anx.user.get', payload: { a: 1 } });
    await flushMicrotasks();
    expect(ctrl.getSnapshot().queuedCount).toBe(1);

    releaseSleep();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    ctrl.destroy();
  });

  it('recovery flushes queue and emits ok', async () => {
    const downs: boolean[] = [];
    const ctrl = createController({
      onDownChange: (d) => downs.push(d),
    });

    now = 0;
    ctrl.reportTransportFailure(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    );
    now = 25_000;
    ctrl.reportTransportFailure(
      Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
    );
    expect(ctrl.getSnapshot().state).toBe('down');

    ctrl.reportReachable();
    expect(ctrl.getSnapshot().state).toBe('ok');
    expect(downs.filter((d) => d === false).length).toBeGreaterThan(0);
    ctrl.destroy();
  });

  it('formatConnectivityTooltip includes queue and disconnects', () => {
    const text = formatConnectivityTooltip({
      state: 'degraded',
      queuedCount: 3,
      oldestQueuedAgeMs: 2000,
      disconnectCount: 2,
      consecutiveFailures: 2,
      firstUnreachableAt: 1,
      lastDisconnectAt: 1,
      lastRecoveredAt: null,
      queuedPeak: 3,
      queueVisible: true,
    });
    expect(text).toContain('3 commands waiting');
    expect(text).toContain('2 disconnects this session');
  });
});
