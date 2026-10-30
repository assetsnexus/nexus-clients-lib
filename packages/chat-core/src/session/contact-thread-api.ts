import type { ChatContact } from '../types.js';
import {
  conversationBelongsToContact,
  conversationIdFromRow,
  historyForContact,
  pickLatestOpenConversation,
  type ConversationRow,
} from './contact-threads.js';
import {
  filterConversationsForLockedAgent,
  lockedAgentAllowsContact,
  withLockedAgentListFilter,
  type LockedAgent,
} from './locked-agent.js';
import {
  conversationAgentNoteFromContact,
  conversationAgentNotesFromRows,
  type ConversationAgentNote,
} from './locked-agent-send.js';

export type CommandClientLike = {
  send: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
};

type ContactRef = Partial<ChatContact> & { id: string };

/** Inference `conversations.list` rejects limit above 100. */
const CONVERSATIONS_LIST_LIMIT_MAX = 100;

function conversationsListLimit(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  return Math.min(rounded, CONVERSATIONS_LIST_LIMIT_MAX);
}

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

function commandCode(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const row = result as { ok?: boolean; code?: unknown };
  if (row.ok !== false) return '';
  return typeof row.code === 'string' ? row.code.trim() : '';
}

/** List is outside this app grant. Sign-in failures still throw. */
function commandDenied(result: unknown): boolean {
  return commandCode(result) === 'APP_COMMAND_FORBIDDEN';
}

function assertCommandOk(result: unknown, command: string): void {
  if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false) {
    const fail = result as { message?: string; code?: string };
    const error = new Error(fail.message || `${command} failed`) as Error & { code?: string };
    if (typeof fail.code === 'string' && fail.code.trim()) error.code = fail.code.trim();
    throw error;
  }
}

function buildConversationCreatePayload(contact: ContactRef, contactId?: string): Record<string, unknown> {
  const virtualEmployeeId =
    contact.type === 'agent' ? contact.virtualEmployeeId || contact.id : undefined;
  const agentId = contact.agentId || undefined;
  const fallbackId = contact.id || contactId || '';
  return virtualEmployeeId
    ? { virtualEmployeeId }
    : { agentId: agentId || fallbackId };
}

async function listConversationRows(
  client: CommandClientLike,
  opts?: {
    status?: 'active' | 'archived' | string;
    limit?: number;
    contactId?: string;
    lockedAgent?: LockedAgent | null;
    /** Raw list rows, including agents the lock will hide. */
    onConversationAgents?: (notes: ConversationAgentNote[]) => void;
  },
): Promise<ConversationRow[]> {
  const payload: Record<string, unknown> = {};
  if (opts?.status) payload.status = opts.status;
  const limit = conversationsListLimit(opts?.limit);
  if (limit != null) payload.limit = limit;
  if (opts?.contactId) payload.contactId = opts.contactId;

  const result = await client.send(
    'anx.communicate.conversations.list',
    withLockedAgentListFilter(payload, opts?.lockedAgent ?? null),
  );
  // The companion grant can create and send without being allowed to list.
  // A hard deny is an empty page for this locked agent, not a failed history load.
  // Any other agent's threads stay unreachable because the lock still filters rows.
  if (opts?.lockedAgent && commandDenied(result)) {
    return [];
  }
  assertCommandOk(result, 'anx.communicate.conversations.list');
  const data = unwrapData(result);
  const rows = Array.isArray(data.conversations)
    ? (data.conversations as ConversationRow[])
    : Array.isArray(data.items)
      ? (data.items as ConversationRow[])
      : [];
  opts?.onConversationAgents?.(conversationAgentNotesFromRows(rows));
  return filterConversationsForLockedAgent(rows, opts?.lockedAgent ?? null);
}

async function createConversationForContact(
  client: CommandClientLike,
  contact: ContactRef,
  opts?: {
    title?: string;
    onConversationAgents?: (notes: ConversationAgentNote[]) => void;
  },
): Promise<string> {
  const result = await client.send('anx.communicate.conversations.create', {
    ...buildConversationCreatePayload(contact, contact.id),
    ...(opts?.title ? { title: opts.title } : {}),
  });
  assertCommandOk(result, 'anx.communicate.conversations.create');
  const data = unwrapData(result);
  const conversationId = String(data.conversationId || '');
  const requestedTitle = typeof opts?.title === 'string' ? opts.title.trim() : '';
  if (conversationId && requestedTitle) {
    const renamed = await client.send('anx.communicate.conversations.update', {
      conversationId,
      title: requestedTitle,
    });
    assertCommandOk(renamed, 'anx.communicate.conversations.update');
  }
  if (conversationId) {
    const note = conversationAgentNoteFromContact(conversationId, contact);
    if (note) opts?.onConversationAgents?.([note]);
  }
  return conversationId;
}

/** Forward/backward cursor for `messages.list`. */
export type MessagesPageCursor = { messageId: string; createdAt: string };

export type MessagesPage = {
  messages: unknown[];
  hasMore: boolean;
  oldest: MessagesPageCursor | null;
  newest: MessagesPageCursor | null;
  hasNewer: boolean;
};

function readCursor(value: unknown): MessagesPageCursor | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { messageId?: unknown; createdAt?: unknown };
  if (typeof row.messageId !== 'string' || !row.messageId.trim()) return null;
  if (typeof row.createdAt !== 'string' || !row.createdAt.trim()) return null;
  return { messageId: row.messageId.trim(), createdAt: row.createdAt.trim() };
}

/**
 * Page of messages. `opts.after` walks forward (delta from the newest turn the
 * client already holds), `opts.before` walks backward (load older). The two are
 * mutually exclusive; `after` wins, matching the inference handler.
 */
export async function listMessagesPage(
  client: CommandClientLike,
  conversationId: string,
  opts?: { limit?: number; before?: MessagesPageCursor | null; after?: MessagesPageCursor | null },
): Promise<MessagesPage> {
  const payload: Record<string, unknown> = { conversationId };
  if (opts?.limit != null) payload.limit = opts.limit;
  if (opts?.after) payload.after = opts.after;
  else if (opts?.before) payload.before = opts.before;
  const result = await client.send('anx.communicate.conversations.messages.list', payload);
  assertCommandOk(result, 'anx.communicate.conversations.messages.list');
  const data = unwrapData(result);
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    hasMore: Boolean(data.hasMore),
    oldest: readCursor(data.oldest),
    newest: readCursor(data.newest),
    hasNewer: Boolean(data.hasNewer),
  };
}

export function createContactThreadApi(
  client: CommandClientLike,
  options?: {
    lockedAgent?: LockedAgent | null;
    onConversationAgents?: (notes: ConversationAgentNote[]) => void;
  },
) {
  const lockedAgent = options?.lockedAgent ?? null;
  const rememberAgents = (notes: ConversationAgentNote[]) => {
    options?.onConversationAgents?.(notes);
  };

  const assertLockedContact = (contact: ContactRef) => {
    if (lockedAgentAllowsContact(lockedAgent, contact)) return;
    throw new Error(`Chat is locked to agent ${lockedAgent?.virtualEmployeeId ?? ''}`);
  };

  return {
    async listConversations(opts?: {
      status?: 'active' | 'archived' | string;
      limit?: number;
      contactId?: string;
    }): Promise<ConversationRow[]> {
      return listConversationRows(client, {
        ...opts,
        lockedAgent,
        onConversationAgents: rememberAgents,
      });
    },

    async listMessages(
      conversationId: string,
      opts?: {
        limit?: number;
        before?: MessagesPageCursor | null;
        after?: MessagesPageCursor | null;
      },
    ): Promise<unknown[]> {
      const page = await listMessagesPage(client, conversationId, opts);
      return page.messages;
    },

    async archiveConversation(conversationId: string): Promise<void> {
      const result = await client.send('anx.communicate.conversations.update', {
        conversationId,
        status: 'archived',
      });
      assertCommandOk(result, 'anx.communicate.conversations.update');
    },

    async reopenConversation(conversationId: string): Promise<void> {
      const result = await client.send('anx.communicate.conversations.update', {
        conversationId,
        status: 'active',
      });
      assertCommandOk(result, 'anx.communicate.conversations.update');
    },

    async deleteConversation(conversationId: string): Promise<void> {
      const result = await client.send('anx.communicate.conversations.delete', {
        conversationId,
      });
      assertCommandOk(result, 'anx.communicate.conversations.delete');
    },

    /**
     * Resume the latest active thread for a contact.
     *
     * `createIfMissing: false` makes this a *pure lookup*: it returns an empty
     * `conversationId` when the contact has no active thread instead of minting
     * one. Callers that must resume an existing session without ever triggering
     * `anx.communicate.conversations.create` (companion windows opening against an
     * agent the viewer may not own) use that so a denied create cannot surface as
     * "conversations.create failed" from the reuse path.
     */
    async openLatest(
      contact: ContactRef,
      opts?: { title?: string; createIfMissing?: boolean },
    ): Promise<{ conversationId: string; created: boolean; messages?: unknown[] }> {
      assertLockedContact(contact);
      const rows = await listConversationRows(client, {
        status: 'active',
        contactId: contact.id,
        lockedAgent,
        onConversationAgents: rememberAgents,
      });
      const forContact = rows.filter((row) => conversationBelongsToContact(row, contact.id, contact));
      const latest = pickLatestOpenConversation(forContact, contact.id, contact);
      if (latest) {
        return { conversationId: conversationIdFromRow(latest), created: false };
      }
      if (opts?.createIfMissing === false) {
        return { conversationId: '', created: false };
      }
      const conversationId = await createConversationForContact(client, contact, {
        ...opts,
        onConversationAgents: rememberAgents,
      });
      return { conversationId, created: true };
    },

    async resetConversation(
      contact: ContactRef,
      currentConversationId?: string | null,
    ): Promise<{ conversationId: string; archivedId: string | null }> {
      assertLockedContact(contact);
      let archivedId: string | null = null;
      if (currentConversationId) {
        await client.send('anx.communicate.conversations.update', {
          conversationId: currentConversationId,
          status: 'archived',
        }).then((result) => {
          assertCommandOk(result, 'anx.communicate.conversations.update');
        });
        archivedId = currentConversationId;
      }
      const conversationId = await createConversationForContact(client, contact, {
        onConversationAgents: rememberAgents,
      });
      return { conversationId, archivedId };
    },

    async history(
      contact: ContactRef,
      opts?: { includeArchived?: boolean },
    ): Promise<ReturnType<typeof historyForContact>> {
      assertLockedContact(contact);
      const rows = await listConversationRows(client, {
        contactId: contact.id,
        lockedAgent,
        onConversationAgents: rememberAgents,
      });
      const forContact = rows.filter((row) => conversationBelongsToContact(row, contact.id, contact));
      const filtered =
        opts?.includeArchived === false
          ? forContact.filter((row) => String(row.status || 'active').toLowerCase() !== 'archived')
          : forContact;
      return historyForContact(filtered, contact.id, contact);
    },
  };
}

export type ContactThreadApi = ReturnType<typeof createContactThreadApi>;
