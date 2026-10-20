/**
 * Send-once client-tool index.
 *
 * A host with a large discoverable registry used to pay for the whole index on
 * every turn. The host now sends it once (chat start / after a page refresh),
 * keeps the server-issued hash, and on later turns sends only that hash — the
 * server reads the index back from its conversation cache.
 *
 * Two things must hold for that to be safe:
 *  - the SDK only re-sends a hash while the local registry is *unchanged*, so a
 *    newly added/removed tool always triggers a full re-send; and
 *  - it never invents the hash value itself — it echoes only what the server
 *    returned, so the two sides can never disagree on the cache key.
 */
import { describe, expect, it } from 'vitest';
import { createNexusChat, localClientToolIndexFingerprint } from '../index.js';
import type { ClientToolIndexEntry } from '../index.js';

/** Minimal valid index row; `access` is required on the SDK type. */
const row = (
  name: string,
  description: string,
  access: ClientToolIndexEntry['access'] = 'write',
): ClientToolIndexEntry => ({ name, description, access });

type Sent = { command: string; payload?: Record<string, unknown> };

const SERVER_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** A client whose send returns a server-issued index hash on every message.send. */
function makeClient(sent: Sent[], hashFor: () => string | null = () => SERVER_HASH) {
  return {
    send: async (command: string, payload?: Record<string, unknown>) => {
      sent.push({ command, payload });
      if (command === 'anx.communicate.message.send') {
        const hash = hashFor();
        return {
          ok: true,
          data: { text: 'ok', conversationId: 'c1', ...(hash ? { clientToolIndexHash: hash } : {}) },
        };
      }
      if (command === 'anx.communicate.stream-init') {
        const resourceId = payload?.conversationId || payload?.roomId || 'c1';
        return { ok: true, data: { endpoints: [], token: null, resourceId } };
      }
      return { ok: true, data: {} };
    },
  };
}

const sends = (sent: Sent[]) =>
  sent.filter((e) => e.command === 'anx.communicate.message.send').map((e) => e.payload ?? {});

function registerDiscoverable(chat: ReturnType<typeof createNexusChat>, name: string) {
  chat.registerClientTool({
    name,
    description: `${name} page tool`,
    availability: 'discoverable',
    access: 'read',
    handler: () => ({ ok: true }),
  });
}

describe('localClientToolIndexFingerprint', () => {
  it('is null for empty or nameless indexes', () => {
    expect(localClientToolIndexFingerprint([])).toBeNull();
    expect(localClientToolIndexFingerprint(undefined)).toBeNull();
    expect(localClientToolIndexFingerprint([{ name: '', description: 'x', access: 'write' }])).toBeNull();
  });

  it('ignores order but changes with content', () => {
    const a = localClientToolIndexFingerprint([row('b', 'second'), row('a', 'first')]);
    const b = localClientToolIndexFingerprint([row('a', 'first'), row('b', 'second')]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(localClientToolIndexFingerprint([row('a', 'first'), row('b', 'changed')])).not.toBe(a);
  });
});

describe('client-tool index send-once', () => {
  it('sends the full index once, then only the server hash', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({ client: makeClient(sent) });
    registerDiscoverable(chat, 'anx.page.highlight');

    await chat.sendMessage('one', { conversationId: 'c1' });
    const first = sends(sent)[0];
    expect(first?.clientToolIndex).toEqual([
      { name: 'anx.page.highlight', description: 'anx.page.highlight page tool', access: 'read' },
    ]);
    expect(first?.clientToolIndexHash).toBeUndefined();

    await chat.sendMessage('two', { conversationId: 'c1' });
    const second = sends(sent)[1];
    expect(second?.clientToolIndex).toBeUndefined();
    expect(second?.clientToolIndexHash).toBe(SERVER_HASH);

    // The third turn behaves the same — the hash keeps flowing, not the index.
    await chat.sendMessage('three', { conversationId: 'c1' });
    const third = sends(sent)[2];
    expect(third?.clientToolIndex).toBeUndefined();
    expect(third?.clientToolIndexHash).toBe(SERVER_HASH);
  });

  it('re-sends the full index when the registry changes', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({ client: makeClient(sent) });
    registerDiscoverable(chat, 'anx.page.highlight');
    await chat.sendMessage('one', { conversationId: 'c1' });
    await chat.sendMessage('two', { conversationId: 'c1' });
    expect(sends(sent)[1]?.clientToolIndexHash).toBe(SERVER_HASH);

    registerDiscoverable(chat, 'anx.page.forms.update_field');
    await chat.sendMessage('three', { conversationId: 'c1' });
    const third = sends(sent)[2];
    expect(third?.clientToolIndex).toHaveLength(2);
    expect(third?.clientToolIndexHash).toBeUndefined();
  });

  it('does not reuse a hash across conversations', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({ client: makeClient(sent) });
    registerDiscoverable(chat, 'anx.page.highlight');
    await chat.sendMessage('one', { conversationId: 'c1' });
    // Switch the active conversation the way a host does; the remembered hash is
    // only valid for the conversation that produced it.
    await chat.streamInit({ conversationId: 'c2' });
    await chat.sendMessage('two', { conversationId: 'c2' });
    const second = sends(sent)[1];
    expect(second?.clientToolIndex).toBeDefined();
    expect(second?.clientToolIndexHash).toBeUndefined();
  });

  it('never sends a hash the server did not issue', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({ client: makeClient(sent, () => null) });
    registerDiscoverable(chat, 'anx.page.highlight');
    await chat.sendMessage('one', { conversationId: 'c1' });
    await chat.sendMessage('two', { conversationId: 'c1' });
    // No hash came back → every turn keeps carrying the full index.
    expect(sends(sent).every((p) => p.clientToolIndex !== undefined)).toBe(true);
    expect(sends(sent).every((p) => p.clientToolIndexHash === undefined)).toBe(true);
  });

  it('honours an explicit per-send index and a forced hash', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({ client: makeClient(sent) });
    registerDiscoverable(chat, 'anx.page.highlight');
    await chat.sendMessage('one', { conversationId: 'c1' });

    // An explicit index always wins over the remembered hash.
    await chat.sendMessage('two', {
      conversationId: 'c1',
      clientToolIndex: [row('anx.page.other', 'override', 'read')],
    });
    const second = sends(sent)[1];
    expect(second?.clientToolIndex).toEqual([row('anx.page.other', 'override', 'read')]);
    // The remembered hash is not attached alongside an explicit index.
    expect(second?.clientToolIndexHash).toBeUndefined();
  });
});
