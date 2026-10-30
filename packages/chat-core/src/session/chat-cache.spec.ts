import { describe, expect, it } from 'vitest';
import {
  ChatCacheStore,
  MemoryChatCacheAdapter,
  buildThreadSkeleton,
  chatCacheListKey,
  chatCacheThreadKey,
  CHAT_CACHE_KEY_PREFIX,
  DEFAULT_CHAT_CACHE_MAX_BYTES,
  type ChatCacheAdapter,
  type CachedConversationList,
  type CachedThreadSkeleton,
} from './chat-cache.js';

function listFixture(rows = 1): CachedConversationList {
  return {
    cachedAt: Date.now(),
    newestUpdatedAt: '2024-01-01T00:00:00.000Z',
    rows: Array.from({ length: rows }, (_, i) => ({
      conversationId: `c${i}`,
      title: `Conversation ${i}`,
      lastMessagePreview: 'hi',
    })),
  };
}

function threadFixture(id = 'c0', turns = 2): CachedThreadSkeleton {
  return buildThreadSkeleton(
    id,
    Array.from({ length: turns }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `message ${i}`,
      createdAt: '2024-01-01T00:00:00.000Z',
      senderName: 'Ada',
    })),
  );
}

/** Adapter that refuses all writes, to prove writes are quota-safe. */
class RefusingAdapter implements ChatCacheAdapter {
  get(): string | null {
    return null;
  }
  set(): void {
    throw new Error('quota exceeded');
  }
  delete(): void {}
  keys(): string[] {
    return [];
  }
}

describe('chat cache keys', () => {
  it('namespaces list + thread keys by scope', () => {
    expect(chatCacheListKey({ scope: 'u1' }, null)).toBe(`${CHAT_CACHE_KEY_PREFIX}:list:u1:active`);
    expect(chatCacheListKey({ scope: 'u1' }, 'archived')).toContain(':archived');
    expect(chatCacheThreadKey({ scope: 'u1' }, 'c9')).toBe(`${CHAT_CACHE_KEY_PREFIX}:thread:u1:c9`);
    // Two scopes never collide.
    expect(chatCacheListKey({ scope: 'u1' })).not.toBe(chatCacheListKey({ scope: 'u2' }));
  });

  it('falls back to an `anon` scope when none is given', () => {
    expect(chatCacheListKey({})).toContain(':list:anon:');
    expect(chatCacheThreadKey({}, 'c1')).toContain(':thread:anon:');
  });
});

describe('ChatCacheStore — metadata round trip', () => {
  it('stores and reads a conversation list', async () => {
    const store = new ChatCacheStore({ adapter: new MemoryChatCacheAdapter() });
    await store.putConversationList({ scope: 'u1' }, listFixture(3));
    const read = await store.getConversationList({ scope: 'u1' });
    expect(read?.rows).toHaveLength(3);
    expect(read?.newestUpdatedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('stores and reads a thread skeleton, keeping previews short', async () => {
    const store = new ChatCacheStore({ adapter: new MemoryChatCacheAdapter() });
    const skeleton = buildThreadSkeleton('c1', [
      { id: 'm1', role: 'assistant', text: 'x'.repeat(5000) },
    ]);
    // A body must never be persisted in full — previews are truncated.
    expect(skeleton.turns[0].preview!.length).toBeLessThan(5000);
    await store.putThreadSkeleton({ scope: 'u1' }, skeleton);
    const read = await store.getThreadSkeleton({ scope: 'u1' }, 'c1');
    expect(read?.lastMessageId).toBe('m1');
    expect(read?.turns).toHaveLength(1);
  });

  it('scopes a thread read to the writing identity', async () => {
    const store = new ChatCacheStore({ adapter: new MemoryChatCacheAdapter() });
    await store.putThreadSkeleton({ scope: 'u1' }, threadFixture('c1'));
    expect(await store.getThreadSkeleton({ scope: 'u2' }, 'c1')).toBeNull();
  });

  it('invalidates one conversation without touching others', async () => {
    const store = new ChatCacheStore({ adapter: new MemoryChatCacheAdapter() });
    await store.putThreadSkeleton({ scope: 'u1' }, threadFixture('c1'));
    await store.putThreadSkeleton({ scope: 'u1' }, threadFixture('c2'));
    await store.invalidateConversation({ scope: 'u1' }, 'c1');
    expect(await store.getThreadSkeleton({ scope: 'u1' }, 'c1')).toBeNull();
    expect(await store.getThreadSkeleton({ scope: 'u1' }, 'c2')).not.toBeNull();
  });

  it('clears every entry but only owns its own prefix', async () => {
    const adapter = new MemoryChatCacheAdapter();
    adapter.set('unrelated:key', 'keep me');
    const store = new ChatCacheStore({ adapter });
    await store.putConversationList({ scope: 'u1' }, listFixture());
    await store.putThreadSkeleton({ scope: 'u1' }, threadFixture('c1'));
    await store.clear();
    expect(adapter.get('unrelated:key')).toBe('keep me');
    expect((await adapter.keys()).filter((k) => k.startsWith(CHAT_CACHE_KEY_PREFIX))).toEqual([]);
  });

  it('fetches with a malformed stored value returns null rather than throwing', async () => {
    const adapter = new MemoryChatCacheAdapter();
    adapter.set(chatCacheThreadKey({ scope: 'u1' }, 'c1'), '{not json');
    const store = new ChatCacheStore({ adapter });
    expect(await store.getThreadSkeleton({ scope: 'u1' }, 'c1')).toBeNull();
  });
});

describe('ChatCacheStore — byte budget + LRU', () => {
  it('defaults to the 100 MB budget', () => {
    const store = new ChatCacheStore({ adapter: new MemoryChatCacheAdapter() });
    expect(store.stats().maxBytes).toBe(DEFAULT_CHAT_CACHE_MAX_BYTES);
  });

  it('evicts the least-recently-touched entry once over budget', async () => {
    let clock = 1000;
    const store = new ChatCacheStore({
      adapter: new MemoryChatCacheAdapter(),
      maxBytes: 400,
      now: () => (clock += 1),
      ttlMs: Number.MAX_SAFE_INTEGER,
    });
    await store.set('a', 'x'.repeat(150));
    await store.set('b', 'y'.repeat(150));
    // Touch 'a' so 'b' is the LRU victim when 'c' pushes us over budget.
    await store.get('a');
    await store.set('c', 'z'.repeat(150));
    expect(await store.get('a')).not.toBeNull();
    expect(store.stats().evictions).toBeGreaterThanOrEqual(1);
    expect(store.stats().bytes).toBeLessThanOrEqual(400);
  });

  it('counts write failures but never throws (quota-safe)', async () => {
    const store = new ChatCacheStore({ adapter: new RefusingAdapter() });
    await expect(store.set('a', 'value')).resolves.toBeUndefined();
    expect(store.stats().writeFailures).toBe(1);
  });
});

describe('ChatCacheStore — TTL', () => {
  it('reports an entry as absent after its TTL elapses', async () => {
    let clock = 1_000;
    const store = new ChatCacheStore({
      adapter: new MemoryChatCacheAdapter(),
      ttlMs: 100,
      now: () => clock,
    });
    await store.set('a', 'value');
    clock += 150;
    expect(await store.get('a')).toBeNull();
  });
});

describe('buildThreadSkeleton', () => {
  it('captures cursors, dedupe-friendly ids, and the has-more flag', () => {
    const skeleton = buildThreadSkeleton(
      'c1',
      [
        { id: 'm1', role: 'user', text: 'one' },
        { id: 'm2', role: 'assistant', text: 'two' },
      ],
      { hasMore: true },
    );
    expect(skeleton.firstMessageId).toBe('m1');
    expect(skeleton.lastMessageId).toBe('m2');
    expect(skeleton.hasMore).toBe(true);
    expect(skeleton.turns.map((t) => t.id)).toEqual(['m1', 'm2']);
  });

  it('yields null cursors for an empty thread', () => {
    const skeleton = buildThreadSkeleton('c1', []);
    expect(skeleton.lastMessageId).toBeNull();
    expect(skeleton.firstMessageId).toBeNull();
    expect(skeleton.turns).toEqual([]);
  });
});
