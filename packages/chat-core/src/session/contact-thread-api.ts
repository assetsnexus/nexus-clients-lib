import type { ChatContact } from '../types.js';
import {
  conversationBelongsToContact,
  conversationIdFromRow,
  historyForContact,
  pickLatestOpenConversation,
  type ConversationRow,
} from './contact-threads.js';

export type CommandClientLike = {
  send: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
};

type ContactRef = Partial<ChatContact> & { id: string };

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

function assertCommandOk(result: unknown, command: string): void {
  if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false) {
    const fail = result as { message?: string };
    throw new Error(fail.message || `${command} failed`);
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
  opts?: { status?: 'active' | 'archived' | string; limit?: number; contactId?: string },
): Promise<ConversationRow[]> {
  const payload: Record<string, unknown> = {};
  if (opts?.status) payload.status = opts.status;
  if (opts?.limit != null) payload.limit = opts.limit;
  if (opts?.contactId) payload.contactId = opts.contactId;

  const result = await client.send('anx.communicate.conversations.list', payload);
  assertCommandOk(result, 'anx.communicate.conversations.list');
  const data = unwrapData(result);
  if (Array.isArray(data.conversations)) return data.conversations as ConversationRow[];
  if (Array.isArray(data.items)) return data.items as ConversationRow[];
  return [];
}

async function createConversationForContact(
  client: CommandClientLike,
  contact: ContactRef,
  opts?: { title?: string },
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
  return conversationId;
}

export function createContactThreadApi(client: CommandClientLike) {
  return {
    async listConversations(opts?: {
      status?: 'active' | 'archived' | string;
      limit?: number;
      contactId?: string;
    }): Promise<ConversationRow[]> {
      return listConversationRows(client, opts);
    },

    async listMessages(
      conversationId: string,
      opts?: { limit?: number },
    ): Promise<unknown[]> {
      const result = await client.send('anx.communicate.conversations.messages.list', {
        conversationId,
        ...(opts?.limit != null ? { limit: opts.limit } : {}),
      });
      assertCommandOk(result, 'anx.communicate.conversations.messages.list');
      const data = unwrapData(result);
      return Array.isArray(data.messages) ? data.messages : [];
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

    async openLatest(
      contact: ContactRef,
      opts?: { title?: string },
    ): Promise<{ conversationId: string; created: boolean; messages?: unknown[] }> {
      const rows = await listConversationRows(client, {
        status: 'active',
        contactId: contact.id,
      });
      const forContact = rows.filter((row) => conversationBelongsToContact(row, contact.id, contact));
      const latest = pickLatestOpenConversation(forContact, contact.id, contact);
      if (latest) {
        return { conversationId: conversationIdFromRow(latest), created: false };
      }
      const conversationId = await createConversationForContact(client, contact, opts);
      return { conversationId, created: true };
    },

    async resetConversation(
      contact: ContactRef,
      currentConversationId?: string | null,
    ): Promise<{ conversationId: string; archivedId: string | null }> {
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
      const conversationId = await createConversationForContact(client, contact);
      return { conversationId, archivedId };
    },

    async history(
      contact: ContactRef,
      opts?: { includeArchived?: boolean },
    ): Promise<ReturnType<typeof historyForContact>> {
      const rows = await listConversationRows(client, { contactId: contact.id });
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
