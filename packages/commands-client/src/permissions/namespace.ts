import type { NexusClient } from '../client.js';
import { NexusError } from '../errors/nexus-error.js';
import { requireCommandData } from '../subject/require-command.js';
import type { PermissionBatchItem } from './validate-batch.js';
import { normalizePermissionBatch } from './validate-batch.js';

export type PermissionBatchResult = {
  requestId: string;
  approvalUrl: string;
  created: boolean;
  status: string;
  items: unknown[];
};

const CREATE = 'anx.permission-grants.requests.create';

export class PermissionsNamespace {
  constructor(private readonly client: NexusClient) {}

  /**
   * Pre-declare a batch of command or data-access items.
   * The region coalesces items for the same grant for 30 seconds (max 40).
   */
  async requestBatch(input: {
    items: PermissionBatchItem[];
    subjectType?: 'user' | 'org_member';
  }): Promise<PermissionBatchResult> {
    const items = normalizePermissionBatch(input.items);
    const payload: Record<string, unknown> = { items };
    if (input.subjectType) payload.subjectType = input.subjectType;
    const result = await this.client.send<PermissionBatchResult>(CREATE, payload);
    const data = requireCommandData(result, CREATE);
    if (typeof data?.requestId !== 'string' || typeof data.approvalUrl !== 'string') {
      throw new NexusError('INVALID_RESPONSE', 'permission batch response is missing requestId or approvalUrl');
    }
    return {
      requestId: data.requestId,
      approvalUrl: data.approvalUrl,
      created: Boolean(data.created),
      status: typeof data.status === 'string' ? data.status : 'open',
      items: Array.isArray(data.items) ? data.items : [],
    };
  }
}
