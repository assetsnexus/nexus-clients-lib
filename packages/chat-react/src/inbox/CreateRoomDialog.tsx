import { useEffect, useMemo, useState } from 'react';
import type { ChatContact } from '@nexus/chat-core';
import {
  agentParticipantOptions,
  assetAgentParticipantOptions,
  DEFAULT_ROOM_MESSAGE_TTL_SECONDS,
  humanParticipantOptions,
  retentionToTtlSeconds,
  ROOM_RETENTION_PRESETS,
} from '../inbox/roomParticipants.js';

export type CreateRoomSubmit = {
  title: string;
  encryptionMode: 'server_group_v1';
  aiParticipants: Array<{
    type: 'agent' | 'asset_agent';
    id: string;
    assetAgentKey?: string;
    displayName?: string;
  }>;
  participants: Array<{ type: 'user'; id: string; displayName?: string }>;
  messageTtlSeconds: number | null;
  createInviteForHumans: boolean;
};

export type CreateRoomDialogProps = {
  open: boolean;
  contacts: ChatContact[];
  saving?: boolean;
  error?: string | null;
  /** Invite code shown after a successful create when humans were invited. */
  inviteToken?: string;
  inviteExpiresAt?: string;
  onCancel: () => void;
  onDone: () => void;
  onSubmit: (payload: CreateRoomSubmit) => void;
};

/**
 * Portal-parity create-room dialog (`CreateRoomDialog.vue`): name, AI/asset/
 * human participant checklists, retention preset, and the invite-code handoff
 * shown after a create that invited people.
 */
export function CreateRoomDialog(props: CreateRoomDialogProps) {
  const [name, setName] = useState('');
  const [agentKeys, setAgentKeys] = useState<string[]>([]);
  const [assetKeys, setAssetKeys] = useState<string[]>([]);
  const [humanKeys, setHumanKeys] = useState<string[]>([]);
  const [retention, setRetention] = useState(String(DEFAULT_ROOM_MESSAGE_TTL_SECONDS));

  useEffect(() => {
    if (!props.open) return;
    setName('');
    setAgentKeys([]);
    setAssetKeys([]);
    setHumanKeys([]);
    setRetention(String(DEFAULT_ROOM_MESSAGE_TTL_SECONDS));
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.open, props.onCancel]);

  const agentOptions = useMemo(() => agentParticipantOptions(props.contacts), [props.contacts]);
  const assetOptions = useMemo(() => assetAgentParticipantOptions(props.contacts), [props.contacts]);
  const humanOptions = useMemo(() => humanParticipantOptions(props.contacts), [props.contacts]);
  const canSubmit = name.trim().length > 0 && !props.saving;

  if (!props.open) return null;

  const toggle = (list: string[], setList: (next: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  };

  const submit = () => {
    if (!canSubmit) return;
    const aiParticipants: CreateRoomSubmit['aiParticipants'] = [
      ...agentKeys
        .map((key) => agentOptions.find((opt) => opt.key === key))
        .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
        // Region accepts `virtual_agent` participants but the room payload uses
        // the plain `agent` discriminator; the id carries the VE identity.
        .map((opt) => ({ type: 'agent' as const, id: opt.id, displayName: opt.label })),
      ...assetKeys
        .map((key) => assetOptions.find((opt) => opt.key === key))
        .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
        .map((opt) => ({
          type: 'asset_agent' as const,
          id: opt.id,
          assetAgentKey: opt.assetAgentKey,
          displayName: opt.label,
        })),
    ];
    const participants: CreateRoomSubmit['participants'] = humanKeys
      .map((key) => humanOptions.find((opt) => opt.key === key))
      .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
      .map((opt) => ({ type: 'user' as const, id: opt.id, displayName: opt.label }));
    props.onSubmit({
      title: name.trim(),
      encryptionMode: 'server_group_v1',
      aiParticipants,
      participants,
      messageTtlSeconds: retentionToTtlSeconds(retention),
      createInviteForHumans: participants.length > 0,
    });
  };

  return (
    <div className="nexus-chat__picker" role="dialog" aria-modal="true" aria-label="New group">
      <div className="nexus-chat__picker-backdrop" onClick={props.onCancel} />
      <div className="nexus-chat__picker-panel">
        <div className="nexus-chat__picker-head">
          <strong>New group</strong>
          <button type="button" className="nexus-chat__picker-close" aria-label="Close" onClick={props.onCancel}>
            ×
          </button>
        </div>
        <div className="nexus-chat__picker-body">
          {props.inviteToken ? (
            <div className="nexus-chat__picker-invite">
              <p>
                <strong>Room ready — invite code</strong>
              </p>
              <code>{props.inviteToken}</code>
              {props.inviteExpiresAt ? <p className="nexus-chat__picker-hint">Expires {props.inviteExpiresAt}</p> : null}
              <button type="button" className="nexus-chat__btn nexus-chat__btn--primary" onClick={props.onDone}>
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="nexus-chat__picker-hint">
                Create a group conversation and add agents, assets, and people.
              </p>
              <label className="nexus-chat__picker-field">
                <span>Room name</span>
                <input
                  type="text"
                  value={name}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              </label>
              {agentOptions.length ? (
                <fieldset className="nexus-chat__picker-fieldset">
                  <legend>Agents</legend>
                  <div className="nexus-chat__picker-checklist">
                    {agentOptions.map((opt) => (
                      <label key={opt.key} className="nexus-chat__picker-check">
                        <input
                          type="checkbox"
                          checked={agentKeys.includes(opt.key)}
                          onChange={() => toggle(agentKeys, setAgentKeys, opt.key)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {assetOptions.length ? (
                <fieldset className="nexus-chat__picker-fieldset">
                  <legend>Asset agents</legend>
                  <div className="nexus-chat__picker-checklist">
                    {assetOptions.map((opt) => (
                      <label key={opt.key} className="nexus-chat__picker-check">
                        <input
                          type="checkbox"
                          checked={assetKeys.includes(opt.key)}
                          onChange={() => toggle(assetKeys, setAssetKeys, opt.key)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {humanOptions.length ? (
                <fieldset className="nexus-chat__picker-fieldset">
                  <legend>People</legend>
                  <div className="nexus-chat__picker-checklist">
                    {humanOptions.map((opt) => (
                      <label key={opt.key} className="nexus-chat__picker-check">
                        <input
                          type="checkbox"
                          checked={humanKeys.includes(opt.key)}
                          onChange={() => toggle(humanKeys, setHumanKeys, opt.key)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <label className="nexus-chat__picker-field">
                <span>Message retention</span>
                <select value={retention} onChange={(event) => setRetention(event.target.value)}>
                  {ROOM_RETENTION_PRESETS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {props.error ? (
                <p className="nexus-chat__picker-error" role="alert">
                  {props.error}
                </p>
              ) : null}
              <div className="nexus-chat__picker-actions">
                <button type="button" className="nexus-chat__btn" disabled={props.saving} onClick={props.onCancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="nexus-chat__btn nexus-chat__btn--primary"
                  disabled={!canSubmit}
                  onClick={submit}
                >
                  {props.saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
