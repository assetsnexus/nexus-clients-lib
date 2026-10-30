/**
 * Durable, bounded, *metadata-only* client cache for chat.
 *
 * Opening the chat after a reload is slow because every open refetches the
 * latest page from the DB. This store persists just enough to render the list
 * and the tail of a thread instantly:
 *   - conversation-list rows (`ConversationHistoryItem`-shaped metadata), and
 *   - per-conversation turn **skeletons** (id / role / createdAt / preview /
 *     sender / lastMessageId) — never message bodies.
 *
 * Bodies are always refetched on open via the delta (`after: lastMessageId`),
 * so at-rest encryption only ever has to protect short preview text. Hosts
 * inject a durable `ChatCacheAdapter` (IndexedDB / a main-process file store /
 * AsyncStorage); the default is an in-memory map that still dedupes work
 * within a session.
 *
 * The byte budget is configurable (`chatCacheMaxBytes`, default 100 MB) and
 * enforced with LRU eviction by last-touch. Writes are quota-safe: a failed
 * adapter write never throws into the chat path.
 */

export type ChatCacheEntryKind = 'conversation_list' | 'thread_skeleton';

export type ChatCacheStats = {
  /** Bytes currently accounted for across all live entries. */
  bytes: number;
  /** Configured cap in bytes. */
  maxBytes: number;
  /** Live entry count. */
  entries: number;
  /** Entries evicted by the byte budget since create. */
  evictions: number;
  /** Writes the adapter refused (quota / IO). */
  writeFailures: number;
};

/**
 * Durable key/value surface a host provides. Byte accounting is the store's
 * job, so the adapter only has to persist opaque strings.
 */
export type ChatCacheAdapter = {
  get: (key: string) => Promise<string | null> | string | null;
  set: (key: string, value: string) => Promise<void> | void;
  delete: (key: string) => Promise<void> | void;
  /** All keys the adapter holds, for a full wipe / stats. */
  keys: () => Promise<string[]> | string[];
  /** Optional synchronous byte estimate; the store falls back to value length. */
  bytes?: () => Promise<number> | number;
};

/** Conversation-list row as cached. Mirrors the inference list item (metadata only). */
export type CachedConversationListItem = {
  conversationId: string;
  title?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  avatarUrl?: string | null;
  virtualEmployeeId?: string | null;
  status?: string | null;
  pinned?: boolean;
  messageCount?: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  oneLineSummary?: string | null;
  unreadCount?: number;
  updatedAt?: string | null;
};

export type CachedConversationList = {
  /** Epoch ms the list was cached. */
  cachedAt: number;
  /** Newest `updatedAt` across the rows — the delta cursor for the next fetch. */
  newestUpdatedAt: string | null;
  rows: CachedConversationListItem[];
};

/** One turn header. No body: `preview` is a short string the list already carries. */
export type CachedTurnSkeleton = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  createdAt?: string | null;
  preview?: string | null;
  senderId?: string | null;
  senderName?: string | null;
};

export type CachedThreadSkeleton = {
  conversationId: string;
  cachedAt: number;
  /** Newest turn id — the `after` cursor for the delta fetch. */
  lastMessageId: string | null;
  /** Oldest turn id — the `before` cursor for load-older. */
  firstMessageId: string | null;
  /** Whether older turns exist beyond `firstMessageId`. */
  hasMore: boolean;
  turns: CachedTurnSkeleton[];
};

export type ChatCacheKeyParts = {
  /** Identity scope so two users on one device never share a cache. */
  scope?: string | null;
};

export const DEFAULT_CHAT_CACHE_MAX_BYTES = 100 * 1024 * 1024;
export const CHAT_CACHE_KEY_PREFIX = 'nexus:chat-cache:v1';

function listKey(parts: ChatCacheKeyParts, status?: string | null): string {
  const scope = parts.scope?.trim() || 'anon';
  const variant = status?.trim() || 'active';
  return `${CHAT_CACHE_KEY_PREFIX}:list:${scope}:${variant}`;
}

function threadKey(parts: ChatCacheKeyParts, conversationId: string): string {
  const scope = parts.scope?.trim() || 'anon';
  return `${CHAT_CACHE_KEY_PREFIX}:thread:${scope}:${conversationId}`;
}

export const chatCacheListKey = listKey;
export const chatCacheThreadKey = threadKey;

/** Adapter that keeps everything in memory — the default when a host injects none. */
export class MemoryChatCacheAdapter implements ChatCacheAdapter {
  private readonly map = new Map<string, string>();

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

type TrackedEntry = { bytes: number; touched: number };

export type ChatCacheStoreOptions = {
  adapter: ChatCacheAdapter;
  maxBytes?: number;
  /** Per-entry TTL in ms. Defaults to 7 days. */
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
};

/**
 * Byte-budgeted LRU over a `ChatCacheAdapter`. Metadata only, so entries stay
 * small; the budget exists so a long-lived device cannot grow unbounded.
 */
export class ChatCacheStore {
  private readonly adapter: ChatCacheAdapter;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly tracked = new Map<string, TrackedEntry>();
  private bytes = 0;
  private evictions = 0;
  private writeFailures = 0;
  private ready: Promise<void> | null = null;

  constructor(options: ChatCacheStoreOptions) {
    this.adapter = options.adapter;
    this.maxBytes =
      Number.isFinite(options.maxBytes) && (options.maxBytes as number) > 0
        ? Math.floor(options.maxBytes as number)
        : DEFAULT_CHAT_CACHE_MAX_BYTES;
    this.ttlMs =
      Number.isFinite(options.ttlMs) && (options.ttlMs as number) > 0
        ? Math.floor(options.ttlMs as number)
        : 7 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  private async ensureIndexed(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      try {
        const keys = await this.adapter.keys();
        for (const key of keys) {
          const entry = await this.safeReadIndexEntry(key);
          if (!entry) continue;
          this.tracked.set(key, entry);
          this.bytes += entry.bytes;
        }
      } catch {
        // A cold adapter (no index yet) is not an error.
      }
    })();
    return this.ready;
  }

  private async safeReadIndexEntry(key: string): Promise<TrackedEntry | null> {
    try {
      const raw = await this.adapter.get(key);
      if (raw == null) return null;
      return { bytes: raw.length, touched: this.now() };
    } catch {
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    await this.ensureIndexed();
    let raw: string | null;
    try {
      raw = await this.adapter.get(key);
    } catch {
      return null;
    }
    if (raw == null) {
      this.tracked.delete(key);
      return null;
    }
    const entry = this.tracked.get(key);
    if (entry && this.now() - entry.touched > this.ttlMs) {
      await this.delete(key);
      return null;
    }
    if (entry) entry.touched = this.now();
    else {
      this.tracked.set(key, { bytes: raw.length, touched: this.now() });
      this.bytes += raw.length;
    }
    return raw;
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureIndexed();
    try {
      await this.adapter.set(key, value);
    } catch {
      this.writeFailures += 1;
      return;
    }
    const prev = this.tracked.get(key);
    if (prev) this.bytes -= prev.bytes;
    this.tracked.set(key, { bytes: value.length, touched: this.now() });
    this.bytes += value.length;
    await this.evictToBudget();
  }

  async delete(key: string): Promise<void> {
    try {
      await this.adapter.delete(key);
    } catch {
      // Deleting a missing key is fine.
    }
    const prev = this.tracked.get(key);
    if (prev) {
      this.bytes = Math.max(0, this.bytes - prev.bytes);
      this.tracked.delete(key);
    }
  }

  /** Drop every entry this store owns (`keys()` prefix-filtered). */
  async clear(): Promise<void> {
    let keys: string[];
    try {
      keys = await this.adapter.keys();
    } catch {
      keys = [...this.tracked.keys()];
    }
    for (const key of keys) {
      if (key.startsWith(CHAT_CACHE_KEY_PREFIX)) await this.delete(key);
    }
    this.tracked.clear();
    this.bytes = 0;
  }

  stats(): ChatCacheStats {
    return {
      bytes: this.bytes,
      maxBytes: this.maxBytes,
      entries: this.tracked.size,
      evictions: this.evictions,
      writeFailures: this.writeFailures,
    };
  }

  private async evictToBudget(): Promise<void> {
    if (this.bytes <= this.maxBytes) return;
    const ordered = [...this.tracked.entries()].sort((a, b) => a[1].touched - b[1].touched);
    for (const [key] of ordered) {
      if (this.bytes <= this.maxBytes) break;
      await this.delete(key);
      this.evictions += 1;
    }
  }

  async getConversationList(
    parts: ChatCacheKeyParts,
    status?: string | null,
  ): Promise<CachedConversationList | null> {
    const raw = await this.get(listKey(parts, status));
    if (!raw) return null;
    return safeJson<CachedConversationList>(raw);
  }

  async putConversationList(
    parts: ChatCacheKeyParts,
    list: CachedConversationList,
    status?: string | null,
  ): Promise<void> {
    await this.set(listKey(parts, status), JSON.stringify(list));
  }

  async getThreadSkeleton(
    parts: ChatCacheKeyParts,
    conversationId: string,
  ): Promise<CachedThreadSkeleton | null> {
    const raw = await this.get(threadKey(parts, conversationId));
    if (!raw) return null;
    return safeJson<CachedThreadSkeleton>(raw);
  }

  async putThreadSkeleton(
    parts: ChatCacheKeyParts,
    skeleton: CachedThreadSkeleton,
  ): Promise<void> {
    await this.set(threadKey(parts, skeleton.conversationId), JSON.stringify(skeleton));
  }

  async invalidateConversation(parts: ChatCacheKeyParts, conversationId: string): Promise<void> {
    await this.delete(threadKey(parts, conversationId));
  }
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Build a thread skeleton from turns in memory. Only header fields survive —
 * `text` is truncated to a short preview so the cache never stores a body.
 */
const PREVIEW_MAX = 160;

export function buildThreadSkeleton(
  conversationId: string,
  turns: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    text?: string;
    createdAt?: string | null;
    senderId?: string | null;
    senderName?: string | null;
  }>,
  opts?: { hasMore?: boolean; cachedAt?: number },
): CachedThreadSkeleton {
  const skeletons: CachedTurnSkeleton[] = turns.map((turn) => ({
    id: String(turn.id),
    role: turn.role,
    createdAt: turn.createdAt ?? null,
    preview: typeof turn.text === 'string' ? turn.text.slice(0, PREVIEW_MAX) : null,
    senderId: turn.senderId ?? null,
    senderName: turn.senderName ?? null,
  }));
  return {
    conversationId,
    cachedAt: opts?.cachedAt ?? Date.now(),
    lastMessageId: skeletons.length ? skeletons[skeletons.length - 1].id : null,
    firstMessageId: skeletons.length ? skeletons[0].id : null,
    hasMore: Boolean(opts?.hasMore),
    turns: skeletons,
  };
}
