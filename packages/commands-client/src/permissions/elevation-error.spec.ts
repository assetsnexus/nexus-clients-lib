import { describe, expect, it } from 'vitest';
import { createTestClient, fixtureOk } from '../testing/index.js';
import { ElevationRequiredError } from './elevation-error.js';
import { PermissionBatchValidationError } from './validate-batch.js';

describe('permissions namespace', () => {
  it('sends a validated batch and returns the approval url', async () => {
    const client = createTestClient({
      'anx.permission-grants.requests.create': (envelope) => {
        const items = envelope.payload.items as Array<{ commandName?: string }>;
        expect(items).toHaveLength(1);
        expect(items[0]?.commandName).toBe('anx.crm.project.list');
        return fixtureOk({
          requestId: 'req-1',
          approvalUrl: '/oauth/permission-requests/req-1',
          created: true,
          status: 'open',
          items,
        });
      },
    });
    const batch = await client.permissions.requestBatch({
      items: [{ kind: 'command', commandName: 'anx.crm.project.list' }],
      subjectType: 'org_member',
    });
    expect(batch.approvalUrl).toBe('/oauth/permission-requests/req-1');
    expect(batch.created).toBe(true);
  });

  it('rejects an empty batch locally', async () => {
    const client = createTestClient({});
    await expect(client.permissions.requestBatch({ items: [] })).rejects.toBeInstanceOf(
      PermissionBatchValidationError,
    );
  });
});

describe('ElevationRequiredError', () => {
  it('maps the app 403 and waits until the request is decided', async () => {
    let polls = 0;
    const client = createTestClient({
      'anx.crm.project.list': () => ({
        responseCode: 403,
        errorObjects: [
          {
            code: 'PERMISSION_ELEVATION_REQUIRED',
            message: 'Permission elevation required for command anx.crm.project.list',
            details: {
              elevationRequestId: 'req-9',
              approvalUrl: '/oauth/permission-requests/req-9',
              command: 'anx.crm.project.list',
            },
          },
        ],
      }),
      'anx.permission-grants.requests.list': () => {
        polls += 1;
        const status = polls < 2 ? 'open' : 'decided';
        return fixtureOk({
          requests: [
            {
              requestId: 'req-9',
              status,
              approvalUrl: '/oauth/permission-requests/req-9',
              items: [{ itemId: 'i1', kind: 'command', decision: status === 'decided' ? 'once' : 'pending' }],
            },
          ],
        });
      },
    });
    const denied = await client.send('anx.crm.project.list', {});
    const error = ElevationRequiredError.fromSendResult(denied);
    expect(error).toBeInstanceOf(ElevationRequiredError);
    expect(error?.approvalUrl).toBe('/oauth/permission-requests/req-9');
    const decided = await error!.waitForDecision(client, { timeoutMs: 5_000, pollAfterMs: 200 });
    expect(decided.status).toBe('decided');
    expect(decided.items[0]?.decision).toBe('once');
  });
});
