import { NexusClient, type Transport } from '../client.js';
import type { CommandResponse } from '../types.js';
import { StaticTokenProvider } from '../token-provider.js';

export type FixtureHandler = (envelope: {
  command: string;
  payload: Record<string, unknown>;
  requestId: string;
}) => CommandResponse | Promise<CommandResponse>;

export function createInMemoryTransport(handlers: Record<string, FixtureHandler>): Transport {
  return {
    async request({ method, path, body }) {
      if (method === 'GET') {
        return {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: JSON.stringify({ ok: true, path }),
        };
      }
      const envelope = body ? JSON.parse(body) : {};
      const command = envelope.command || decodeURIComponent(path.replace(/^\/command\//, ''));
      const handler = handlers[command];
      if (!handler) {
        return {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: JSON.stringify({
            responseCode: 404,
            errorObjects: [{ code: 'NOT_FOUND', message: `No fixture for ${command}` }],
          }),
        };
      }
      const response = await handler(envelope);
      return {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-nexus-ratelimit-limit': '100',
          'x-nexus-ratelimit-remaining': '99',
        }),
        text: JSON.stringify(response),
      };
    },
  };
}

export function fixtureOk(data: unknown = {}): CommandResponse {
  return { responseCode: 200, responseObject: data };
}

export function fixtureAccepted(overrides?: Partial<{
  jobId: string;
  sessionId: string;
  status: string;
}>): CommandResponse {
  return {
    responseCode: 202,
    responseObject: {
      accepted: true,
      status: overrides?.status || 'queued',
      ...(overrides?.jobId ? { jobId: overrides.jobId } : { jobId: 'job_1' }),
      ...(overrides?.sessionId ? { sessionId: overrides.sessionId } : {}),
    },
  };
}

export function fixtureLongRunning(overrides?: Partial<{
  taskId: string;
  status: string;
  mode: string;
  command: string;
  sessionId: string;
  jobId: string;
  pollAfterMs: number;
  expiresAt: string;
}>): CommandResponse {
  return {
    responseCode: 102,
    responseObject: {
      accepted: true,
      taskId: overrides?.taskId || 'lrt_1',
      status: overrides?.status || 'queued',
      mode: overrides?.mode || 'poll',
      command: overrides?.command || 'anx.demo.report',
      statusCommand: 'anx.long-running.get',
      cancelCommand: 'anx.long-running.cancel',
      pollAfterMs: overrides?.pollAfterMs ?? 1000,
      expiresAt: overrides?.expiresAt || '2026-09-02T00:00:00.000Z',
      ...(overrides?.sessionId ? { sessionId: overrides.sessionId } : {}),
      ...(overrides?.jobId ? { jobId: overrides.jobId } : {}),
    },
  };
}

export function fixtureAcceptedLegacy202(overrides?: Partial<{
  jobId: string;
  sessionId: string;
  status: string;
}>): CommandResponse {
  return fixtureAccepted(overrides);
}

export function fixtureTaskView(overrides?: Partial<{
  taskId: string;
  status: string;
  command: string;
}>): CommandResponse {
  return {
    responseCode: 200,
    responseObject: {
      task: {
        taskId: overrides?.taskId || 'lrt_1',
        command: overrides?.command || 'anx.demo.report',
        status: overrides?.status || 'succeeded',
        mode: 'poll',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:01.000Z',
        expiresAt: '2026-09-02T00:00:00.000Z',
        result: { reportId: 'r1' },
      },
    },
  };
}

export function fixtureSca(authRequestId = 'auth_test'): CommandResponse {
  return {
    responseCode: 202,
    responseObject: {
      authorizationRequired: true,
      authRequestId,
      authMethod: '2fa_user_mail',
      sentTo: 'al***com',
      channelType: 'email',
      authorizationText: 'Confirm this action',
      dynamicFields: { command: 'anx.wallet.transfer' },
      dynamicFieldsHash: '05AFEE585FFCF655',
      uiMetadata: {
        type: 'code',
        authorizationText: 'Confirm this action',
        dynamicFields: [{ label: 'Command', value: 'anx.wallet.transfer' }],
        dynamicFieldsHash: '05AFEE585FFCF655',
      },
    },
  };
}

export function fixtureDataAccessApproval(overrides?: Partial<{
  grantId: string;
  resourceId: string;
}>): CommandResponse {
  return {
    responseCode: 403,
    errorObjects: [
      {
        code: 'DATA_ACCESS_APPROVAL_REQUIRED',
        message: 'Data access requires your approval.',
        details: {
          grantId: overrides?.grantId || 'g1',
          access: 'read',
          resource: { kind: 'file', id: overrides?.resourceId || 'f1', name: 'Doc' },
          parents: [],
        },
      },
    ],
  };
}

export function fixtureRateLimited(): {
  status: number;
  headers: Headers;
  text: string;
} {
  return {
    status: 429,
    headers: new Headers({
      'retry-after': '2',
      'x-nexus-ratelimit-limit': '10',
      'x-nexus-ratelimit-remaining': '0',
      'x-nexus-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 2),
    }),
    text: JSON.stringify({
      responseCode: 429,
      errorObjects: [{ code: 'RATE_LIMITED', message: 'Too many requests' }],
    }),
  };
}

export function createTestClient(handlers: Record<string, FixtureHandler>): NexusClient {
  return new NexusClient({
    baseUrl: 'https://test.local',
    tokenProvider: new StaticTokenProvider('test-token'),
    transport: createInMemoryTransport(handlers),
    maxRetries: 0,
  });
}
