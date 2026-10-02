import type { NexusClient } from '../client.js';
import { NexusError } from '../errors/nexus-error.js';
import { requireCommandData } from './require-command.js';
import { normalizeFieldRequest } from './field-catalog.js';
import type {
  FieldRequestItem,
  FieldsGetResult,
  FieldsRequestResult,
  RegulatoryStatusResult,
  RegulatoryStatusRow,
  SubjectIdentitiesResult,
} from './types.js';

const IDENTITIES = 'anx.oauth2.subject.identities.list';
const REGULATORY = 'anx.oauth2.subject.regulatory-status.get';
const FIELDS_GET = 'anx.oauth2.subject.fields.get';
const FIELDS_REQUEST = 'anx.oauth2.subject.fields.request';

const STATUS_VALUES = new Set(['verified', 'pending', 'rejected', 'expired', 'revoked', 'none']);

function assertStatuses(rows: unknown): RegulatoryStatusRow[] {
  if (!Array.isArray(rows)) {
    throw new NexusError('INVALID_RESPONSE', 'regulatory status response is missing statuses');
  }
  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new NexusError('INVALID_RESPONSE', 'regulatory status row is invalid');
    }
    const item = row as RegulatoryStatusRow;
    if (!item.bundleSlug || !STATUS_VALUES.has(item.status)) {
      throw new NexusError('INVALID_RESPONSE', 'regulatory status row is invalid');
    }
    return item;
  });
}

export class SubjectFieldsNamespace {
  constructor(private readonly client: NexusClient) {}

  async get(): Promise<FieldsGetResult> {
    const result = await this.client.send<FieldsGetResult>(FIELDS_GET, {}, { isRead: true });
    const data = requireCommandData(result, FIELDS_GET);
    return {
      fields: data?.fields && typeof data.fields === 'object' ? data.fields : {},
      omitted: Array.isArray(data?.omitted) ? data.omitted : [],
    };
  }

  async request(fields: FieldRequestItem[]): Promise<FieldsRequestResult> {
    const normalized = normalizeFieldRequest(fields);
    const result = await this.client.send<FieldsRequestResult>(FIELDS_REQUEST, { fields: normalized });
    const data = requireCommandData(result, FIELDS_REQUEST);
    return {
      requestId: typeof data?.requestId === 'string' ? data.requestId : null,
      alreadyGranted: Array.isArray(data?.alreadyGranted) ? data.alreadyGranted : [],
      pending: Array.isArray(data?.pending) ? data.pending : [],
    };
  }
}

export class SubjectNamespace {
  readonly fields: SubjectFieldsNamespace;

  constructor(private readonly client: NexusClient) {
    this.fields = new SubjectFieldsNamespace(client);
  }

  /** Consented identities for this user and client. Does not list unconsented memberships. */
  async identities(): Promise<SubjectIdentitiesResult> {
    const result = await this.client.send<SubjectIdentitiesResult>(IDENTITIES, {}, { isRead: true });
    const data = requireCommandData(result, IDENTITIES);
    return { identities: Array.isArray(data?.identities) ? data.identities : [] };
  }

  /**
   * Public regulatory rows plus a short-lived RS256 attestation.
   * Verify the JWS with `verifyAttestation` before trusting `statuses`.
   */
  async regulatoryStatus(): Promise<RegulatoryStatusResult> {
    const result = await this.client.send<RegulatoryStatusResult>(REGULATORY, {}, { isRead: true });
    const data = requireCommandData(result, REGULATORY);
    const attestation = typeof data?.attestation === 'string' ? data.attestation : '';
    if (!attestation) {
      throw new NexusError('INVALID_RESPONSE', 'regulatory status response is missing attestation');
    }
    return {
      statuses: assertStatuses(data.statuses),
      attestation,
      attestationExpiresAt:
        typeof data.attestationExpiresAt === 'string' ? data.attestationExpiresAt : '',
    };
  }
}
