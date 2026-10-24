import { describe, expect, it } from 'vitest';
import type { ChatContact } from '@nexus/chat-core';
import {
  agentParticipantOptions,
  assetAgentParticipantOptions,
  DEFAULT_ROOM_MESSAGE_TTL_SECONDS,
  humanParticipantOptions,
  retentionToTtlSeconds,
  ROOM_RETENTION_PRESETS,
} from './roomParticipants.js';

const contact = (over: Partial<ChatContact> & { id: string }): ChatContact =>
  ({ name: over.id, type: 'agent', ...over }) as ChatContact;

describe('room participants', () => {
  it('builds agent options from the VE id, falling back to the agent id', () => {
    const opts = agentParticipantOptions([
      contact({ id: 'c1', name: 'Rune', virtualEmployeeId: 've-1' }),
      contact({ id: 'c2', name: 'Nox', agentId: 'ag-2' }),
      contact({ id: 'c3', name: '', agentId: 'ag-3' }),
      contact({ id: 'u1', name: 'Ada', type: 'user' }),
    ]);
    expect(opts.map((o) => o.key)).toEqual(['agent:ve-1', 'agent:ag-2', 'agent:ag-3']);
    expect(opts.map((o) => o.id)).toEqual(['ve-1', 'ag-2', 'ag-3']);
    expect(opts[2].label).toBe('ag-3');
  });

  it('requires both an asset id and an agent key for asset options', () => {
    const opts = assetAgentParticipantOptions([
      contact({ id: 'x', name: 'Printer', type: 'asset_agent', assetId: 'as-1', assetAgentKey: 'k-1' }),
      contact({ id: 'y', name: 'Half', type: 'asset_agent', assetId: 'as-2' }),
      contact({ id: 'z', name: 'NoKey', type: 'asset_agent', assetAgentKey: 'k-3' }),
    ]);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ key: 'asset_agent:as-1:k-1', id: 'as-1', assetAgentKey: 'k-1' });
  });

  it('offers people only', () => {
    const opts = humanParticipantOptions([
      contact({ id: 'u1', name: 'Ada', type: 'user' }),
      contact({ id: 'a1', name: 'Rune' }),
    ]);
    expect(opts.map((o) => o.key)).toEqual(['user:u1']);
  });

  it('tolerates a missing or malformed contact list', () => {
    expect(agentParticipantOptions([])).toEqual([]);
    expect(agentParticipantOptions(undefined as unknown as ChatContact[])).toEqual([]);
    expect(humanParticipantOptions([null as unknown as ChatContact])).toEqual([]);
  });

  it('resolves a retention preset to seconds, with off meaning null', () => {
    expect(retentionToTtlSeconds(String(DEFAULT_ROOM_MESSAGE_TTL_SECONDS))).toBe(DEFAULT_ROOM_MESSAGE_TTL_SECONDS);
    expect(retentionToTtlSeconds('off')).toBeNull();
    expect(retentionToTtlSeconds('')).toBe(DEFAULT_ROOM_MESSAGE_TTL_SECONDS);
    expect(retentionToTtlSeconds('-5')).toBe(DEFAULT_ROOM_MESSAGE_TTL_SECONDS);
    expect(retentionToTtlSeconds('nonsense')).toBe(DEFAULT_ROOM_MESSAGE_TTL_SECONDS);
  });

  it('ships a 30-day default preset', () => {
    const def = ROOM_RETENTION_PRESETS.find((p) => p.isDefault);
    expect(def?.value).toBe(String(DEFAULT_ROOM_MESSAGE_TTL_SECONDS));
    expect(ROOM_RETENTION_PRESETS.some((p) => p.value === 'off')).toBe(true);
  });
});
