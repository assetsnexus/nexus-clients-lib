import { describe, expect, it } from 'vitest';
import { actionTarget, visibleActions } from './index.js';
import type { NotificationRouteInput } from './types.js';

describe('visibleActions', () => {
  const row: NotificationRouteInput = {
    id: 'n1',
    presentation: {
      actions: [
        { id: 'ack', label: 'Ack', style: 'primary', kind: 'callback' },
        { id: 'retry', label: 'Retry', style: 'secondary', kind: 'callback', once: false },
        { id: 'open', label: 'Open', style: 'link', kind: 'open', link: { kind: 'path', path: '/sp/crm' } },
      ],
    },
    actionResults: [
      { actionId: 'ack', userId: 'u1', at: new Date('2026-10-02T12:00:00.000Z'), status: 'handled' },
    ],
  };

  it('hides once callbacks already completed by this user', () => {
    expect(visibleActions(row, { userId: 'u1' }).map((action) => action.id)).toEqual(['retry', 'open']);
    expect(visibleActions(row, { userId: 'u2' }).map((action) => action.id)).toEqual(['ack', 'retry', 'open']);
  });

  it('keeps a failed once-callback visible and hides claimed, delivered, and handled', () => {
    const withStatus = (status: 'claimed' | 'delivered' | 'handled' | 'failed') =>
      visibleActions(
        {
          ...row,
          actionResults: [{ actionId: 'ack', userId: 'u1', at: new Date('2026-10-02T12:00:00.000Z'), status }],
        },
        { userId: 'u1' },
      ).map((action) => action.id);

    expect(withStatus('failed')).toEqual(['ack', 'retry', 'open']);
    expect(withStatus('claimed')).toEqual(['retry', 'open']);
    expect(withStatus('delivered')).toEqual(['retry', 'open']);
    expect(withStatus('handled')).toEqual(['retry', 'open']);
  });

  it('resolves an open action through the row target', () => {
    const open = row.presentation?.actions?.[2];
    expect(open).toBeDefined();
    const target = actionTarget(open!, row, { surface: 'portal', currentPath: '/b2b/home' });
    expect(target).toMatchObject({ kind: 'path', value: '/sp/crm', grade: 'detail' });
  });
});
