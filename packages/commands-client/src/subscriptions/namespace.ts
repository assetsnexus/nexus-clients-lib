import type { NexusClient } from '../client.js';
import { NexusError } from '../errors/nexus-error.js';
import { requireCommandData } from '../subject/require-command.js';

const APP_SUBSCRIPTION_GET = 'anx.oauth2.app-subscription.get';
const APPSTORE_LIST = 'anx.oauth2.appstore.list';
const APPSTORE_GET = 'anx.oauth2.appstore.get';

/**
 * Shape returned by `OAuth2AppSubscriptionGetHandler`.
 * The handler ignores the caller and always returns the free tier.
 * Paid tiers, `APP_PLAN`, and reseller offer seeds are not implemented.
 */
export type AppSubscriptionSnapshot = {
  tiers: Array<{ tierId: string; name?: string; isDefault?: boolean; price?: number }>;
  activeTier: Array<{ tierId: string }>;
  managedExternally: boolean;
};

export type AppStoreListingSummary = {
  clientId: string;
  name: string;
  description?: string;
  tagline?: string;
  category?: string;
  targetAudience: string[];
  visibility: string;
  publishedAt?: string;
};

export type AppStoreListResult = {
  items: AppStoreListingSummary[];
  total: number;
};

function readSnapshot(data: unknown): AppSubscriptionSnapshot {
  if (!data || typeof data !== 'object') {
    throw new NexusError('INVALID_RESPONSE', 'app subscription response is invalid');
  }
  const row = data as Record<string, unknown>;
  if (!Array.isArray(row.tiers) || !Array.isArray(row.activeTier) || typeof row.managedExternally !== 'boolean') {
    throw new NexusError('INVALID_RESPONSE', 'app subscription response is invalid');
  }
  return {
    tiers: row.tiers.map((item) => {
      const tier = item as Record<string, unknown>;
      if (typeof tier.tierId !== 'string' || !tier.tierId) {
        throw new NexusError('INVALID_RESPONSE', 'app subscription tier is invalid');
      }
      return {
        tierId: tier.tierId,
        ...(typeof tier.name === 'string' ? { name: tier.name } : {}),
        ...(typeof tier.isDefault === 'boolean' ? { isDefault: tier.isDefault } : {}),
        ...(typeof tier.price === 'number' ? { price: tier.price } : {}),
      };
    }),
    activeTier: row.activeTier.map((item) => {
      const tier = item as Record<string, unknown>;
      if (typeof tier.tierId !== 'string' || !tier.tierId) {
        throw new NexusError('INVALID_RESPONSE', 'app subscription active tier is invalid');
      }
      return { tierId: tier.tierId };
    }),
    managedExternally: row.managedExternally,
  };
}

function readListing(item: unknown): AppStoreListingSummary {
  if (!item || typeof item !== 'object') {
    throw new NexusError('INVALID_RESPONSE', 'app store listing is invalid');
  }
  const row = item as Record<string, unknown>;
  if (typeof row.clientId !== 'string' || typeof row.name !== 'string') {
    throw new NexusError('INVALID_RESPONSE', 'app store listing is invalid');
  }
  return {
    clientId: row.clientId,
    name: row.name,
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
    ...(typeof row.tagline === 'string' ? { tagline: row.tagline } : {}),
    ...(typeof row.category === 'string' ? { category: row.category } : {}),
    targetAudience: Array.isArray(row.targetAudience) ? row.targetAudience.map(String) : [],
    visibility: typeof row.visibility === 'string' ? row.visibility : 'private',
    ...(typeof row.publishedAt === 'string' ? { publishedAt: row.publishedAt } : {}),
  };
}

export class SubscriptionsNamespace {
  constructor(private client: NexusClient) {}

  /**
   * `anx.oauth2.app-subscription.get`. Builtin-allowed for an app token.
   * The region handler currently returns a fixed free tier and `managedExternally: false`.
   */
  async getActiveTier(): Promise<AppSubscriptionSnapshot> {
    const res = await this.client.send<AppSubscriptionSnapshot>(APP_SUBSCRIPTION_GET, {}, { isRead: true });
    return readSnapshot(requireCommandData(res, APP_SUBSCRIPTION_GET));
  }

  async listAppStoreListings(params?: {
    category?: string;
    targetAudience?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<AppStoreListResult> {
    const res = await this.client.send<{ items?: unknown; total?: unknown }>(APPSTORE_LIST, params || {}, { isRead: true });
    const data = requireCommandData(res, APPSTORE_LIST);
    if (!data || !Array.isArray(data.items) || typeof data.total !== 'number') {
      throw new NexusError('INVALID_RESPONSE', 'app store list is invalid');
    }
    return { items: data.items.map(readListing), total: data.total };
  }

  async getListing(clientId: string): Promise<AppStoreListingSummary> {
    const res = await this.client.send(APPSTORE_GET, { clientId }, { isRead: true });
    return readListing(requireCommandData(res, APPSTORE_GET));
  }
}
