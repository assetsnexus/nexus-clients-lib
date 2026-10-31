import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StreamEndpointResolver,
  createOutgoingQueueMetrics,
  createOutgoingSendQueue,
  fallbackTransportSelected,
  flushOutgoingMessages,
  outgoingQueueBannerText,
  outgoingThreadKey,
  reduceReachLatch,
  sessionListPresence,
  shouldAutoFlushOutgoing,
  shouldHoldOutgoingForNexus,
  subscribeConversationActivity,
  type ActivityConnectionStatus,
  type ActivityEvent,
  type ChatModelOverride,
  type CommandClient,
  type FallbackChatTransport,
  type NexusChat,
  type OutgoingSendQueue,
  type SessionListPresence,
} from '@nexus/chat-core';

const queueLogger = {
  info: (message: string, extra?: Record<string, unknown>) => {
    console.info(message, extra);
  },
  warn: (message: string, extra?: Record<string, unknown>) => {
    console.warn(message, extra);
  },
};

export function useOutgoingQueue(input: {
  chat: NexusChat;
  client?: CommandClient | null;
  conversationId?: string | null;
  contactId?: string | null;
  contactStatus?: string | null;
  streaming: boolean;
  nexusUnavailable: boolean;
  fallbackTransport?: FallbackChatTransport | null;
  /**
   * Fired for every user-inbox activity event (new message, generation beat,
   * unread change, sub-agent settle). The host uses it to refresh the affected
   * conversation live — including background agent messages, which arrive with
   * no per-conversation stream and would otherwise be invisible until a manual
   * re-open.
   */
  onInboxEvent?: (event: ActivityEvent) => void;
}) {
  const queueRef = useRef<OutgoingSendQueue | null>(null);
  if (!queueRef.current) queueRef.current = createOutgoingSendQueue();
  const queue = queueRef.current;
  const metricsRef = useRef(createOutgoingQueueMetrics({ logger: queueLogger }));
  const [revision, setRevision] = useState(0);
  const [activity, setActivity] = useState<ActivityConnectionStatus>('disconnected');
  const [liveStreamConnected, setLiveStreamConnected] = useState(false);
  const [nexusReplyDelivered, setNexusReplyDelivered] = useState(false);
  const flushAttemptedRef = useRef(false);
  const flushingRef = useRef(false);
  const bump = () => setRevision((n) => n + 1);

  const {
    chat,
    client,
    conversationId,
    contactId,
    contactStatus,
    streaming,
    nexusUnavailable,
    fallbackTransport,
  } = input;

  useEffect(() => {
    setLiveStreamConnected(chat.hasLiveStream());
    return chat.subscribe(() => {
      setLiveStreamConnected(chat.hasLiveStream());
    });
  }, [chat]);

  // The callback lives in a ref so a caller that re-creates its handler on every
  // render does not tear down and rebuild the shared user-inbox WebSocket.
  const onInboxEventRef = useRef(input.onInboxEvent);
  onInboxEventRef.current = input.onInboxEvent;

  useEffect(() => {
    if (!client?.send) return undefined;
    const resolver = new StreamEndpointResolver();
    return subscribeConversationActivity({
      client,
      streamResolver: resolver,
      isLiveConnected: () => {
        try {
          return chat.hasLiveStream();
        } catch {
          return false;
        }
      },
      // Was a no-op, so a background agent message (self-wake / reminder) never
      // reached the host: the sidebar badge stayed stale and an open thread
      // stayed blank until the user clicked the conversation again.
      onEvent: (event) => onInboxEventRef.current?.(event),
      onConnectionStatus: (status) => setActivity(status),
    });
  }, [chat, client]);

  const presence: SessionListPresence = sessionListPresence({
    contactStatus,
    activityConnectionStatus: activity,
    liveStreamConnected,
  });
  const threadKey = outgoingThreadKey({ conversationId, contactId });
  const hostUnavailable = nexusUnavailable || fallbackTransportSelected(fallbackTransport);
  const holdForNexus = shouldHoldOutgoingForNexus({
    hostUnavailable,
    presence,
    nexusReplyDelivered,
  });
  const items = queue.listForThread(threadKey);
  const bannerText = outgoingQueueBannerText({
    count: items.length,
    lastError: items[0]?.lastError,
    presence,
    nexusReplyDelivered,
  });

  const noteNexusReply = useCallback(() => {
    setNexusReplyDelivered((prev) => reduceReachLatch(prev, { type: 'nexus_reply' }));
    flushAttemptedRef.current = false;
  }, []);

  const noteTransportFailure = useCallback(() => {
    let live = false;
    try {
      live = chat.hasLiveStream();
    } catch {
      live = false;
    }
    setNexusReplyDelivered((prev) => reduceReachLatch(prev, { type: 'transport_failure', liveStreamConnected: live }));
  }, [chat]);

  const flush = useCallback(
    async (reason: 'auto' | 'manual') => {
      if (flushingRef.current) return;
      const pending = queue.listForThread(threadKey);
      if (!pending.length) return;
      flushingRef.current = true;
      try {
        const outcome = await flushOutgoingMessages({
          items: pending,
          reason,
          threadKey,
          metrics: metricsRef.current,
          logger: queueLogger,
          shouldSend: (item) => queue.list().some((row) => row.id === item.id),
          send: async (item) => {
            const result = await chat.sendMessage(item.text, {
              conversationId: conversationId || undefined,
              contactId: contactId || undefined,
              attachments: item.attachmentRefs as never,
              ...(item.modelOverride ? { modelOverride: item.modelOverride as ChatModelOverride } : {}),
              ...(item.reasoningEffort ? { reasoningEffort: item.reasoningEffort } : {}),
              bypassFallback: true,
            });
            if (result.ok && result.transport !== 'fallback') {
              setNexusReplyDelivered((prev) => reduceReachLatch(prev, { type: 'nexus_reply' }));
            }
            return result;
          },
          onSent: (item) => queue.remove(item.id),
          onFailed: (item, message) => queue.markError(item.id, message),
        });
        if (outcome === 'failed') {
          let live = false;
          try {
            live = chat.hasLiveStream();
          } catch {
            live = false;
          }
          setNexusReplyDelivered((prev) =>
            reduceReachLatch(prev, { type: 'transport_failure', liveStreamConnected: live }),
          );
        }
      } finally {
        flushingRef.current = false;
        bump();
      }
    },
    [chat, contactId, conversationId, queue, threadKey],
  );

  useEffect(() => {
    const online = presence === 'online' || nexusReplyDelivered;
    if (!online) {
      flushAttemptedRef.current = false;
      return;
    }
    if (
      !shouldAutoFlushOutgoing({
        pending: queue.listForThread(threadKey).length,
        streaming,
        presence,
        nexusReplyDelivered,
        flushAttempted: flushAttemptedRef.current,
      })
    ) {
      return;
    }
    flushAttemptedRef.current = true;
    void flush('auto');
  }, [flush, nexusReplyDelivered, presence, queue, revision, streaming, threadKey]);

  const retry = useCallback(() => {
    flushAttemptedRef.current = true;
    void flush('manual');
  }, [flush]);

  const cancel = useCallback(() => {
    const removed = queue.cancelThread(threadKey);
    if (!removed.length) {
      queueLogger.warn('outgoing_queue_cancel_empty', { threadKey });
      return;
    }
    const ids = removed.map((item) => item.localTurnId).filter((id): id is string => Boolean(id));
    if (ids.length) chat.discardLocalUnsentTurns(ids);
    metricsRef.current.record('cancelled', removed.length);
    bump();
  }, [chat, queue, threadKey]);

  const noteQueued = useCallback(() => {
    metricsRef.current.record('enqueued');
    bump();
  }, []);

  return {
    queue,
    revision,
    queueCount: items.length,
    bannerText,
    // Holding for Nexus is the only reason to skip the host fallback.
    // A missing grant does not. The queue flush retries Nexus on its own.
    bypassFallback: holdForNexus,
    presence,
    nexusReplyDelivered,
    threadKey,
    retry,
    cancel,
    noteNexusReply,
    noteTransportFailure,
    noteQueued,
  };
}
