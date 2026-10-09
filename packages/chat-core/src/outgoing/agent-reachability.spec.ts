import { describe, expect, it, vi } from 'vitest';
import {
  isGrantFailureCode,
  isUnreachableLabel,
  outgoingQueueBannerText,
  reduceReachLatch,
  sessionErrorAfterFailure,
  sessionListPresence,
  shouldAutoFlushOutgoing,
  shouldHoldOutgoingForNexus,
  unreachableLabelVisible,
} from './agent-reachability.js';
import { flushOutgoingMessages } from './flush-outgoing.js';
import { createOutgoingQueueMetrics } from './outgoing-queue.metrics.js';
import { createOutgoingSendQueue, outgoingThreadKey } from './outgoing-queue.js';
import { discardableUnsentTurnIds } from './unsent-turns.js';

describe('session list presence', () => {
  it('matches the portal conversation list: activity connected or a live stream is online', () => {
    expect(sessionListPresence({ activityConnectionStatus: 'connected' })).toBe('online');
    expect(
      sessionListPresence({ activityConnectionStatus: 'error', liveStreamConnected: true }),
    ).toBe('online');
    expect(sessionListPresence({ liveStreamConnected: true })).toBe('online');
    expect(sessionListPresence({ activityConnectionStatus: 'error' })).toBe('error');
    expect(sessionListPresence({ activityConnectionStatus: 'connecting' })).toBe('connecting');
    expect(sessionListPresence({ activityConnectionStatus: 'disconnected' })).toBe('offline');
    expect(sessionListPresence({ contactStatus: 'disabled', activityConnectionStatus: 'connected' })).toBe('disabled');
    expect(sessionListPresence({ assetPresence: 'edge-offline', activityConnectionStatus: 'connected' })).toBe(
      'edge-offline',
    );
  });
});

describe('unreachable label', () => {
  it('clears while the agent is online or a Nexus reply was delivered, and ignores a fallback reply', () => {
    const message = 'Nexus could not be reached. Please try again shortly.';
    expect(isUnreachableLabel(message)).toBe(true);
    expect(
      unreachableLabelVisible({ presence: 'online', nexusReplyDelivered: false, message }),
    ).toBe(false);
    expect(
      unreachableLabelVisible({ presence: 'offline', nexusReplyDelivered: true, message }),
    ).toBe(false);
    expect(reduceReachLatch(false, { type: 'fallback_reply' })).toBe(false);
    expect(reduceReachLatch(false, { type: 'nexus_reply' })).toBe(true);
    expect(
      reduceReachLatch(true, { type: 'transport_failure', liveStreamConnected: true }),
    ).toBe(true);
    expect(
      reduceReachLatch(true, { type: 'transport_failure', liveStreamConnected: false }),
    ).toBe(false);
    expect(
      unreachableLabelVisible({ presence: 'offline', nexusReplyDelivered: false, message }),
    ).toBe(true);
    expect(isGrantFailureCode('NO_NEXUS_GRANT')).toBe(true);
    expect(isUnreachableLabel('Sign in with Nexus to chat.')).toBe(false);
    expect(
      sessionErrorAfterFailure({
        current: 'Nexus could not be reached. Please try again shortly.',
        message: 'Nexus could not be reached. Please try again shortly.',
        code: 'NEXUS_UNAVAILABLE',
        presence: 'online',
        nexusReplyDelivered: false,
      }),
    ).toBeNull();
    expect(
      sessionErrorAfterFailure({
        current: null,
        message: 'Sign in with Nexus to chat.',
        code: 'NO_NEXUS_GRANT',
        presence: 'online',
        nexusReplyDelivered: true,
      }),
    ).toBe('Sign in with Nexus to chat.');
  });

  it('drops the unreachable sentence from the queue banner while the agent is online', () => {
    expect(
      outgoingQueueBannerText({
        count: 2,
        lastError: 'Nexus could not be reached. Try again shortly.',
        presence: 'online',
        nexusReplyDelivered: false,
      }),
    ).toBe('2 queued messages');
    expect(
      outgoingQueueBannerText({
        count: 1,
        lastError: 'Nexus could not be reached. Try again shortly.',
        presence: 'offline',
        nexusReplyDelivered: false,
      }),
    ).toBe('1 queued message — Nexus could not be reached. Try again shortly.');
  });

  it('does not hold new sends when the session list would show the agent online', () => {
    expect(
      shouldHoldOutgoingForNexus({ hostUnavailable: true, presence: 'online', nexusReplyDelivered: false }),
    ).toBe(false);
    expect(
      shouldHoldOutgoingForNexus({ hostUnavailable: true, presence: 'offline', nexusReplyDelivered: false }),
    ).toBe(true);
    expect(
      shouldHoldOutgoingForNexus({ hostUnavailable: true, presence: 'offline', nexusReplyDelivered: true }),
    ).toBe(false);
  });

  it('flushes once when the path is reachable and not while a reply is still streaming', () => {
    expect(
      shouldAutoFlushOutgoing({
        pending: 2,
        streaming: true,
        presence: 'online',
        nexusReplyDelivered: true,
        flushAttempted: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoFlushOutgoing({
        pending: 2,
        streaming: false,
        presence: 'online',
        nexusReplyDelivered: false,
        flushAttempted: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoFlushOutgoing({
        pending: 2,
        streaming: false,
        presence: 'online',
        nexusReplyDelivered: false,
        flushAttempted: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoFlushOutgoing({
        pending: 1,
        streaming: false,
        presence: 'offline',
        nexusReplyDelivered: false,
        flushAttempted: false,
      }),
    ).toBe(false);
  });
});

describe('outgoing queue cancel and flush', () => {
  it('cancel drops only this thread and does not touch server history', () => {
    const queue = createOutgoingSendQueue({ now: () => 1, nextId: () => 'q1' });
    const thread = outgoingThreadKey({ conversationId: 'c1' });
    expect(queue.enqueue({ threadKey: thread, text: 'pending', hold: 'unreachable' })).toBe('q1');
    queue.enqueue({ threadKey: outgoingThreadKey({ conversationId: 'c2' }), text: 'other', hold: 'unreachable' });
    const removed = queue.cancelThread(thread);
    expect(removed.map((item) => item.text)).toEqual(['pending']);
    expect(queue.list().map((item) => item.text)).toEqual(['other']);
    const turns = [
      { id: 'server-1', role: 'assistant', text: 'already here' },
      { id: 'local-1', role: 'user', deliveryStatus: 'failed' },
      { id: 'local-2', role: 'user', deliveryStatus: 'sent' },
    ];
    expect(discardableUnsentTurnIds(turns, ['server-1', 'local-1', 'local-2'])).toEqual(['local-1']);
  });

  it('auto flush sends on the Nexus path and keeps Retry when that send fails', async () => {
    const metrics = createOutgoingQueueMetrics();
    const queue = createOutgoingSendQueue({ now: () => 1, nextId: () => 'q1' });
    const thread = outgoingThreadKey({ conversationId: 'c1' });
    queue.enqueue({ threadKey: thread, text: 'hello', hold: 'unreachable', lastError: 'Nexus could not be reached.' });
    const send = vi.fn(async () => ({ ok: false, code: 'NEXUS_UNAVAILABLE', message: 'Nexus could not be reached.' }));
    const outcome = await flushOutgoingMessages({
      items: queue.listForThread(thread),
      send,
      onSent: (item) => queue.remove(item.id),
      onFailed: (item, message) => queue.markError(item.id, message),
      metrics,
      reason: 'auto',
      threadKey: thread,
    });
    expect(outcome).toBe('failed');
    expect(queue.list()).toHaveLength(1);
    expect(metrics.snapshot().flush_failed).toBe(1);
    expect(metrics.snapshot().flushed).toBe(0);
  });

  it('does not send items cancelled while an earlier flush send is in flight', async () => {
    const metrics = createOutgoingQueueMetrics();
    const queue = createOutgoingSendQueue({
      now: () => 1,
      nextId: (() => {
        let n = 0;
        return () => `q${++n}`;
      })(),
    });
    queue.enqueue({ threadKey: 'conv:c1', text: 'first', hold: 'unreachable' });
    queue.enqueue({ threadKey: 'conv:c1', text: 'second', hold: 'unreachable' });
    const sent: string[] = [];
    const outcome = await flushOutgoingMessages({
      items: queue.list(),
      send: async (item) => {
        sent.push(item.text);
        queue.cancelThread('conv:c1');
        return { ok: true };
      },
      onSent: (item) => queue.remove(item.id),
      onFailed: () => {},
      metrics,
      reason: 'manual',
      threadKey: 'conv:c1',
      shouldSend: (item) => queue.list().some((row) => row.id === item.id),
    });
    expect(sent).toEqual(['first']);
    expect(outcome).toBe('flushed');
    expect(queue.list()).toHaveLength(0);
  });

  it('does not treat a fallback completion as delivered', async () => {
    const metrics = createOutgoingQueueMetrics();
    const item = {
      id: 'q1',
      threadKey: 'conv:c1',
      text: 'hello',
      createdAt: 1,
      hold: 'unreachable' as const,
    };
    const outcome = await flushOutgoingMessages({
      items: [item],
      send: async () => ({ ok: true, transport: 'fallback' }),
      onSent: () => {
        throw new Error('must not drop the queue');
      },
      onFailed: () => {},
      metrics,
      reason: 'auto',
      threadKey: 'conv:c1',
    });
    expect(outcome).toBe('failed');
    expect(metrics.snapshot().flushed).toBe(0);
    expect(metrics.snapshot().flush_failed).toBe(1);
  });

  it('counts a successful Nexus flush and a cancel', async () => {
    const logs: string[] = [];
    const metrics = createOutgoingQueueMetrics({
      logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
    });
    const queue = createOutgoingSendQueue({ now: () => 1, nextId: () => 'q1' });
    const thread = outgoingThreadKey({ conversationId: 'c1' });
    queue.enqueue({ threadKey: thread, text: 'hello', hold: 'unreachable' });
    const outcome = await flushOutgoingMessages({
      items: queue.list(),
      send: async () => ({ ok: true }),
      onSent: (item) => queue.remove(item.id),
      onFailed: () => {},
      metrics,
      reason: 'auto',
      threadKey: thread,
    });
    expect(outcome).toBe('flushed');
    expect(queue.list()).toHaveLength(0);
    queue.enqueue({ threadKey: thread, text: 'drop me', hold: 'unreachable' });
    const removed = queue.cancelThread(thread);
    expect(removed).toHaveLength(1);
    metrics.record('cancelled', removed.length);
    expect(metrics.snapshot()).toMatchObject({ flushed: 1, cancelled: 1, flush_failed: 0 });
    expect(logs).toContain('anx_chat_outgoing_queue_total');
  });
});
