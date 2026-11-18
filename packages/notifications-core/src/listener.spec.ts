import { describe, expect, it, vi } from 'vitest';
import { createNotificationListener, matchesNotificationFilter } from './listener.js';

describe('matchesNotificationFilter', () => {
  it('matches everything with an empty filter', () => {
    expect(matchesNotificationFilter(undefined, { eventKey: 'x' })).toBe(true);
    expect(matchesNotificationFilter({}, { eventKey: 'x' })).toBe(true);
  });

  it('filters by category', () => {
    const filter = { categoryKeys: ['inference.api_keys'] };
    expect(matchesNotificationFilter(filter, { categoryKey: 'inference.api_keys' })).toBe(true);
    expect(matchesNotificationFilter(filter, { categoryKey: 'crm.leads' })).toBe(false);
  });

  it('filters by event key with a prefix pattern', () => {
    const filter = { eventKeys: ['inference.proxy_key.*'] };
    expect(matchesNotificationFilter(filter, { eventKey: 'inference.proxy_key.limit' })).toBe(true);
    expect(matchesNotificationFilter(filter, { eventKey: 'inference.other' })).toBe(false);
  });

  it('filters by resource, app and urgency', () => {
    expect(
      matchesNotificationFilter(
        { resource: 'proxy_key', appClientId: 'client-1', urgency: ['high', 'critical'] },
        { resource: 'proxy_key', appClientId: 'client-1', urgency: 'critical' },
      ),
    ).toBe(true);
    expect(
      matchesNotificationFilter({ appClientId: 'client-1' }, { appClientId: 'client-2' }),
    ).toBe(false);
    expect(matchesNotificationFilter({ urgency: ['critical'] }, { urgency: 'low' })).toBe(false);
  });

  it('runs the predicate last', () => {
    const predicate = vi.fn(() => false);
    expect(matchesNotificationFilter({ predicate }, { eventKey: 'x' })).toBe(false);
    expect(predicate).toHaveBeenCalled();
  });
});

describe('createNotificationListener', () => {
  it('delivers only matching notifications', () => {
    const handle = createNotificationListener({ filter: { categoryKeys: ['crm.leads'] } });
    const seen: string[] = [];
    handle.on((notification) => seen.push(String(notification.eventKey)));
    handle.push({ categoryKey: 'crm.leads', eventKey: 'lead.created' });
    handle.push({ categoryKey: 'inference.api_keys', eventKey: 'key.limit' });
    expect(seen).toEqual(['lead.created']);
  });

  it('unsubscribes', () => {
    const handle = createNotificationListener();
    const listener = vi.fn();
    const off = handle.on(listener);
    off();
    handle.push({ eventKey: 'x' });
    expect(listener).not.toHaveBeenCalled();
    expect(handle.listenerCount()).toBe(0);
  });

  it('isolates a throwing listener', () => {
    const onError = vi.fn();
    const handle = createNotificationListener({ onError });
    const second = vi.fn();
    handle.on(() => {
      throw new Error('boom');
    });
    handle.on(second);
    handle.push({ eventKey: 'x' });
    expect(onError).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('clears every listener', () => {
    const handle = createNotificationListener();
    handle.on(() => undefined);
    handle.clear();
    expect(handle.listenerCount()).toBe(0);
  });
});
