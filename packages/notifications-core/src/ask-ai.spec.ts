import { describe, expect, it } from 'vitest';
import { buildNotificationAskContext, formatAskFragment } from './index.js';

describe('buildNotificationAskContext', () => {
  it('excludes raw data and truncates the body', () => {
    const secret = 'super-secret-token';
    const tail = 'TAIL';
    const ask = buildNotificationAskContext({
      id: 'n1',
      title: 'Proof needed',
      body: `${'x'.repeat(500)}${tail}`,
      eventKey: 'crm.assigned',
      categoryKey: 'crm.leads',
      type: 'system',
      createdAt: new Date('2026-10-02T12:00:00.000Z'),
      source: { kind: 'org' },
      data: { secret, leadId: 'L1', nested: { secret } },
    });

    expect(ask.label).toBe('Proof needed');
    expect(ask.references).toEqual([{ type: 'notification', entityId: 'n1' }]);
    expect(ask.context.body).toHaveLength(500);
    expect(ask.context.body).not.toContain(tail);
    expect(ask.context).not.toHaveProperty('data');
    expect(JSON.stringify(ask.context)).not.toContain(secret);
    expect(ask.context).toMatchObject({
      id: 'n1',
      title: 'Proof needed',
      eventKey: 'crm.assigned',
      categoryKey: 'crm.leads',
      type: 'system',
      createdAt: '2026-10-02T12:00:00.000Z',
      sender: 'org',
    });

    const fragment = formatAskFragment(ask);
    expect(fragment.startsWith('@notification:n1 ')).toBe(true);
    expect(fragment).not.toContain(secret);
    expect(fragment).not.toContain(tail);
    const parsed = JSON.parse(fragment.slice(fragment.indexOf('{')));
    expect(parsed).not.toHaveProperty('data');
    expect(parsed.body).toHaveLength(500);
  });

  it('adds a chat entity reference for cluster, product, and blueprint', () => {
    const cluster = buildNotificationAskContext({
      id: 'n2',
      title: 'Cluster',
      body: 'ready',
      data: { clusterId: 'c1', secret: 'nope' },
    });
    expect(cluster.references).toEqual([
      { type: 'notification', entityId: 'n2' },
      { type: 'cluster', entityId: 'c1' },
    ]);
    expect(formatAskFragment(cluster).startsWith('@notification:n2 @cluster:c1 ')).toBe(true);

    const product = buildNotificationAskContext({
      id: 'n3',
      title: 'Product',
      data: { productId: 'p1' },
    });
    expect(product.references.map((ref) => ref.type)).toEqual(['notification', 'marketplace_product']);

    const blueprint = buildNotificationAskContext({
      id: 'n4',
      title: 'Blueprint',
      data: { nav: { resource: 'asset_blueprint', id: 'bp1' } },
    });
    expect(blueprint.references).toContainEqual({ type: 'asset_blueprint', entityId: 'bp1' });
    expect(formatAskFragment(blueprint)).toContain('@asset_blueprint:bp1');
  });
});
