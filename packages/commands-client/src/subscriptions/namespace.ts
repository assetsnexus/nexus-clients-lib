import type { NexusClient } from '../client.js';

export class SubscriptionsNamespace {
  constructor(private client: NexusClient) {}

  async getActiveTier(params?: { clientId?: string }): Promise<unknown> {
    const res = await this.client.send('anx.oauth2.app-subscription.get', params || {});
    if (!res.ok) throw new Error(res.error.message || 'getActiveTier failed');
    return res.data;
  }

  async listAppStoreListings(params?: {
    category?: string;
    targetAudience?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const res = await this.client.send('anx.oauth2.appstore.list', params || {});
    if (!res.ok) throw new Error(res.error.message || 'listAppStoreListings failed');
    return res.data;
  }

  async getListing(clientId: string): Promise<unknown> {
    const res = await this.client.send('anx.oauth2.appstore.get', { clientId });
    if (!res.ok) throw new Error(res.error.message || 'getListing failed');
    return res.data;
  }
}
