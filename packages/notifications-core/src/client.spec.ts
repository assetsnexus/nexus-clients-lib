import { describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_COMMANDS, createNotificationsClient } from './client.js';
import type { NotificationCommandClient, NotificationInboxItem } from './client.js';

function transport(responses: Record<string, unknown>) {
  const calls: Array<{ name: string; payload: unknown }> = [];
  const command = vi.fn(async (name: string, payload?: unknown) => {
    calls.push({ name, payload });
    if (!(name in responses)) throw new Error(`unexpected command ${name}`);
    return responses[name];
  });
  return { command: command as unknown as NotificationCommandClient['command'], calls };
}

const row: NotificationInboxItem = {
  id: 'n-1',
  title: 'Build failed',
  body: 'Pipeline 12 failed',
  eventKey: 'build.failed',
  categoryKey: 'build',
  presentation: {
    actions: [
      { id: 'open', label: 'Open', style: 'primary', kind: 'open' },
      { id: 'retry', label: 'Retry', style: 'secondary', kind: 'callback', once: true },
    ],
  },
};

describe('createNotificationsClient', () => {
  it('dispatches with the typed payload and reports the count', async () => {
    const { command, calls } = transport({
      [NOTIFICATION_COMMANDS.DISPATCH]: { notification: row, dispatched: 1 },
    });
    const client = createNotificationsClient({ command });

    const result = await client.dispatch({
      type: 'app.build',
      title: 'Build failed',
      body: 'Pipeline 12 failed',
      eventKey: 'build.failed',
      priority: 'high',
    });

    expect(result.dispatched).toBe(1);
    expect(result.notification?.id).toBe('n-1');
    expect(calls[0]).toEqual({
      name: NOTIFICATION_COMMANDS.DISPATCH,
      payload: {
        type: 'app.build',
        title: 'Build failed',
        body: 'Pipeline 12 failed',
        eventKey: 'build.failed',
        priority: 'high',
      },
    });
  });

  it('returns every row of a multi-recipient dispatch', async () => {
    const { command } = transport({
      [NOTIFICATION_COMMANDS.DISPATCH]: {
        notification: row,
        notifications: [row, { ...row, id: 'n-2' }],
        dispatched: 2,
      },
    });
    const client = createNotificationsClient({ command });
    const result = await client.dispatch({ type: 't', title: 'a', body: 'b' });
    expect(result.dispatched).toBe(2);
    expect(result.notifications?.map((n) => n.id)).toEqual(['n-1', 'n-2']);
  });

  it('lists with a default empty payload and tolerates a missing body', async () => {
    const { command, calls } = transport({ [NOTIFICATION_COMMANDS.LIST]: {} });
    const client = createNotificationsClient({ command });
    const page = await client.list();
    expect(page).toEqual({ notifications: [], total: 0 });
    expect(calls[0].payload).toEqual({});
  });

  it('passes list filters through unchanged', async () => {
    const { command, calls } = transport({
      [NOTIFICATION_COMMANDS.LIST]: { notifications: [row], total: 1 },
    });
    const client = createNotificationsClient({ command });
    const page = await client.list({ unreadOnly: true, limit: 20 });
    expect(page.total).toBe(1);
    expect(calls[0].payload).toEqual({ unreadOnly: true, limit: 20 });
  });

  it('returns null when get finds nothing', async () => {
    const { command } = transport({ [NOTIFICATION_COMMANDS.GET]: {} });
    const client = createNotificationsClient({ command });
    expect(await client.get('missing')).toBeNull();
  });

  it('marks read and unread through the documented command names', async () => {
    const { command, calls } = transport({
      [NOTIFICATION_COMMANDS.MARK_READ]: { ok: true },
      [NOTIFICATION_COMMANDS.MARK_UNREAD]: { notification: row },
    });
    const client = createNotificationsClient({ command });
    await client.markRead('n-1');
    expect(await client.markUnread('n-1')).toEqual(row);
    expect(calls.map((c) => c.name)).toEqual([
      NOTIFICATION_COMMANDS.MARK_READ,
      NOTIFICATION_COMMANDS.MARK_UNREAD,
    ]);
  });

  it('normalizes mark-all-read to an updated count', async () => {
    const { command } = transport({ [NOTIFICATION_COMMANDS.MARK_ALL_READ]: { modified: 7 } });
    const client = createNotificationsClient({ command });
    expect(await client.markAllRead()).toEqual({ updated: 7 });
  });

  it('hides a once-callback this user already consumed', () => {
    const { command } = transport({});
    const client = createNotificationsClient({ command });
    const consumed: NotificationInboxItem = {
      ...row,
      actionResults: [{ actionId: 'retry', userId: 'u1', status: 'handled' }],
    };
    expect(client.actions(consumed, 'u1').map((a) => a.id)).toEqual(['open']);
    // Another user's result must not hide it.
    expect(client.actions(consumed, 'u2').map((a) => a.id)).toEqual(['open', 'retry']);
  });

  it('resolves a tap through the shared route catalog', () => {
    const { command } = transport({});
    const client = createNotificationsClient({ command });
    const target = client.resolveTap({
      ...row,
      data: { leadId: 'lead-1' },
      eventKey: 'crm.lead.created',
    });
    expect(target.kind).not.toBe('none');
  });

  it('invokes an action with both ids', async () => {
    const { command, calls } = transport({ [NOTIFICATION_COMMANDS.ACTION_INVOKE]: { ok: true } });
    const client = createNotificationsClient({ command });
    await client.invokeAction('n-1', 'retry');
    expect(calls[0].payload).toEqual({ notificationId: 'n-1', actionId: 'retry' });
  });
});
