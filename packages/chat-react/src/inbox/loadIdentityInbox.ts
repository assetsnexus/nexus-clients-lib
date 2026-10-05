import type { ChatIdentitySession } from '../bridge/host-bridge.js';
import type { CommandClient } from '@nexus/chat-core';
import { conversationToRow, sortInboxRows, unwrapList, type InboxRow } from './inboxRows.js';

export type IdentitySend = (identity: ChatIdentitySession, command: string, payload?: Record<string, unknown>) => Promise<unknown>;

function commandData(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const rec = result as Record<string, unknown>;
  if (rec.ok === false) {
    throw new Error(typeof rec.message === 'string' ? rec.message : 'Chat command failed');
  }
  return rec.data ?? rec.responseObject ?? result;
}

export async function loadIdentityInbox(input: {
  identities: ChatIdentitySession[];
  hiddenKeys: string[];
  send: IdentitySend;
}): Promise<{ rows: InboxRow[]; errors: string[] }> {
  const hidden = new Set(input.hiddenKeys);
  const visible = input.identities.filter((row) => row.token && !hidden.has(row.key));
  const errors: string[] = [];
  const rows: InboxRow[] = [];

  await Promise.all(
    visible.map(async (identity) => {
      try {
        const conversations = commandData(
          await input.send(identity, 'anx.communicate.conversations.list', { limit: 50, status: 'active' }),
        );
        const list = unwrapList(conversations, ['conversations', 'items', 'rows']);
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const row = conversationToRow(item as Record<string, unknown>, {
            key: identity.key,
            label: identity.label,
            logo: identity.orgLogo || identity.avatarUrl,
          });
          if (row) rows.push(row);
        }
      } catch (error) {
        errors.push(`${identity.label}: ${error instanceof Error ? error.message : 'Could not load conversations'}`);
      }
    }),
  );

  return { rows: sortInboxRows(rows), errors };
}

export function sendWithClient(client: CommandClient & { updateAuth?: (next: { identity?: Record<string, unknown> }) => void }): IdentitySend {
  return async (identity, command, payload) => {
    client.updateAuth?.({
      identity: {
        token: identity.token,
        userId: identity.userId,
        orgId: identity.orgId,
        role: identity.role,
        deviceId: identity.deviceId,
      },
    });
    return client.send(command, payload);
  };
}
