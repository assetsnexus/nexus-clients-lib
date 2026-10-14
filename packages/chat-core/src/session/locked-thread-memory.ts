/** Last conversation this browser opened for a locked agent. */

const STORAGE_KEY = 'nexus.chat.lockedThread.v1';

export type LockedThreadMemory = {
  conversationId: string;
  agentId: string | null;
  /** Opening line, kept when the server has not stored it as a message yet. */
  greetingText?: string | null;
};

export type LockedThreadStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readMap(storage: LockedThreadStorage): Record<string, LockedThreadMemory> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, LockedThreadMemory>;
  } catch {
    return {};
  }
}

export function readLockedThread(
  storage: LockedThreadStorage | null | undefined,
  virtualEmployeeId: string,
): LockedThreadMemory | null {
  const id = clean(virtualEmployeeId);
  if (!storage || !id) return null;
  const row = readMap(storage)[id];
  const conversationId = clean(row?.conversationId);
  if (!conversationId) return null;
  const agentId = clean(row?.agentId);
  const greetingText = clean(row?.greetingText);
  return { conversationId, agentId: agentId || null, ...(greetingText ? { greetingText } : {}) };
}

export function writeLockedThread(
  storage: LockedThreadStorage | null | undefined,
  virtualEmployeeId: string,
  memory: LockedThreadMemory,
): void {
  const id = clean(virtualEmployeeId);
  const conversationId = clean(memory.conversationId);
  if (!storage || !id || !conversationId) return;
  try {
    const map = readMap(storage);
    const previous = map[id];
    const sameThread = clean(previous?.conversationId) === conversationId;
    const greetingText =
      clean(memory.greetingText) || (sameThread ? clean(previous?.greetingText) : '');
    map[id] = {
      conversationId,
      agentId: clean(memory.agentId) || null,
      ...(greetingText ? { greetingText } : {}),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

export function browserLockedThreadStorage(): LockedThreadStorage | null {
  try {
    const storage = (globalThis as { localStorage?: LockedThreadStorage }).localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}
