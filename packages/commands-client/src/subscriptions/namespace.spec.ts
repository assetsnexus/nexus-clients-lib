import { describe, expect, it } from 'vitest';
import { createTestClient, fixtureOk } from '../testing/index.js';

describe('SubscriptionsNamespace', () => {
  it('reads the free-tier snapshot the region handler returns', async () => {
    const client = createTestClient({
      'anx.oauth2.app-subscription.get': () => fixtureOk({
        tiers: [{ tierId: 'free', name: 'Free', isDefault: true, price: 0 }],
        activeTier: [{ tierId: 'free' }],
        managedExternally: false,
      }),
    });
    const snapshot = await client.subscriptions.getActiveTier();
    expect(snapshot.activeTier).toEqual([{ tierId: 'free' }]);
    expect(snapshot.managedExternally).toBe(false);
    expect(snapshot.tiers[0]?.price).toBe(0);
  });
});
