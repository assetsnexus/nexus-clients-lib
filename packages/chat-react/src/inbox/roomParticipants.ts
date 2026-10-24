import type { ChatContact } from '@nexus/chat-core';

/**
 * Room participant options for the create-room dialog, mirroring the portal's
 * `CreateRoomDialog.vue` option builders. Pure so the dialog stays presentational
 * and this mapping is unit-testable.
 */

export type AgentParticipantOption = {
  key: string;
  type: 'agent' | 'virtual_agent';
  id: string;
  label: string;
};

export type AssetAgentParticipantOption = {
  key: string;
  type: 'asset_agent';
  id: string;
  assetAgentKey: string;
  label: string;
};

export type HumanParticipantOption = {
  key: string;
  type: 'user';
  id: string;
  label: string;
};

function labelOf(contact: ChatContact, fallback: string): string {
  const name = typeof contact.name === 'string' ? contact.name.trim() : '';
  return name || fallback;
}

/** Agents (`agent` / `virtual_agent`) offered as AI room participants. */
export function agentParticipantOptions(contacts: ChatContact[]): AgentParticipantOption[] {
  return (contacts || [])
    .filter((c) => c && c.type === 'agent')
    .map((c) => {
      const id = String(c.virtualEmployeeId || c.agentId || c.id || '');
      return { key: `agent:${id}`, type: 'agent' as const, id, label: labelOf(c, id) };
    })
    .filter((o) => o.id);
}

/** Asset agents, keyed by asset id + agent key (portal `assetAgentOptions`). */
export function assetAgentParticipantOptions(
  contacts: ChatContact[],
): AssetAgentParticipantOption[] {
  return (contacts || [])
    .filter((c) => c && c.type === 'asset_agent')
    .map((c) => {
      const id = String(c.assetId || '');
      const assetAgentKey = String(c.assetAgentKey || '');
      return {
        key: `asset_agent:${id}:${assetAgentKey}`,
        type: 'asset_agent' as const,
        id,
        assetAgentKey,
        label: labelOf(c, assetAgentKey || id),
      };
    })
    .filter((o) => o.id && o.assetAgentKey);
}

/** People offered as human room participants. */
export function humanParticipantOptions(contacts: ChatContact[]): HumanParticipantOption[] {
  return (contacts || [])
    .filter((c) => c && c.type === 'user')
    .map((c) => ({ key: `user:${c.id}`, type: 'user' as const, id: c.id, label: labelOf(c, c.id) }))
    .filter((o) => o.id);
}

/** Default room message TTL: 30 days (portal `DEFAULT_ROOM_MESSAGE_TTL_SECONDS`). */
export const DEFAULT_ROOM_MESSAGE_TTL_SECONDS = 30 * 24 * 3600;

export type RetentionOption = { value: string; label: string; isDefault?: boolean };

/** Retention presets the dialog offers (`off` = retain indefinitely). */
export const ROOM_RETENTION_PRESETS: RetentionOption[] = [
  { value: String(7 * 24 * 3600), label: '7 days' },
  { value: String(DEFAULT_ROOM_MESSAGE_TTL_SECONDS), label: '30 days (default)', isDefault: true },
  { value: String(90 * 24 * 3600), label: '90 days' },
  { value: 'off', label: 'Keep indefinitely' },
];

/** Resolve a retention preset string to a `messageTtlSeconds` value (null = off). */
export function retentionToTtlSeconds(preset: string): number | null {
  if (preset === 'off') return null;
  const n = Number(preset);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROOM_MESSAGE_TTL_SECONDS;
}
