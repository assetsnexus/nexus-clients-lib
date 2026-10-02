import { describe, expect, it } from 'vitest';
import { toActivityEvent } from './activity-subscribe.js';
import type { StreamEvent } from '../stream/stream-events.js';

describe('activity events', () => {
  it('passes orgId and roomId through inbox activity', () => {
    const event = toActivityEvent({
      type: 'activity',
      data: { roomId: 'room-1', orgId: 'org-a', kind: 'room_message' },
    } as StreamEvent);
    expect(event?.data.orgId).toBe('org-a');
    expect(event?.data.roomId).toBe('room-1');
    expect(event?.data.conversationId).toBe('');
  });

  it('keeps a private orgId null so the client refreshes that identity only', () => {
    const event = toActivityEvent({
      type: 'activity',
      data: { conversationId: 'c1', orgId: null, kind: 'unread' },
    } as StreamEvent);
    expect(event?.data.orgId).toBeNull();
    expect(event?.data.conversationId).toBe('c1');
  });
});
