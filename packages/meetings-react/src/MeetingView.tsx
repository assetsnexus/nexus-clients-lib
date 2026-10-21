import { useState, type CSSProperties } from 'react';
import {
  agentParticipantCount,
  meetingViewTabs,
  type MeetingCardModel,
  type MeetingParticipant,
  type MeetingViewTab,
  type RoomMediaSession,
} from '@nexus/meetings-core';

export type { MeetingViewTab } from '@nexus/meetings-core';

export type MeetingViewProps = {
  card: MeetingCardModel;
  session: RoomMediaSession;
  /** Slot for the native video surface (host-provided). */
  videoSlot?: React.ReactNode;
  /** Slot for the 3D scene tab (portal cluster editor). */
  sceneSlot?: React.ReactNode;
  /** Called when an agent moderation control is used. */
  onModerate?: (
    participantId: string,
    action: 'mute' | 'disable-listening' | 'set-volume',
    value: boolean | number,
  ) => void;
};

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: '#0b0f14',
  color: '#e8eef4',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
};

const tabsStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '8px 10px',
  borderBottom: '1px solid #1e2731',
};

const btn: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid #3a4654',
  background: '#1c2430',
  color: '#e8eef4',
  cursor: 'pointer',
  fontSize: 12,
};

/**
 * Meeting view (Phase 11).
 *
 * The host-agnostic room view: video, participants (with agent moderation),
 * screenshare, and an optional 3D scene tab. Tabs are gated by the card's
 * `surfaces` so a Zoom meeting shows only the participants/description view
 * while a nexus room shows video, screenshare, and the cluster scene.
 */
export function MeetingView({ card, session, videoSlot, sceneSlot, onModerate }: MeetingViewProps) {
  const tabs = meetingViewTabs(card);
  const [active, setActive] = useState<MeetingViewTab>(tabs[0] ?? 'participants');
  const agents = agentParticipantCount(session);

  return (
    <div style={wrap}>
      <div style={tabsStyle}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            style={{
              ...btn,
              background: active === tab ? '#243244' : '#1c2430',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {card.provider === 'nexus' && agents > 0 ? (
          <span style={{ fontSize: 11, color: '#9aa7b5' }}>{agents} agent(s)</span>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        {active === 'video' ? (videoSlot ?? <p style={{ color: '#9aa7b5' }}>Video surface unavailable.</p>) : null}
        {active === 'screenshare' ? <p style={{ color: '#9aa7b5' }}>Screenshare surface.</p> : null}
        {active === 'scene' ? (sceneSlot ?? <p style={{ color: '#9aa7b5' }}>No 3D scene bound to this room.</p>) : null}
        {active === 'participants' ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {session.participants.map((p) => (
              <ParticipantRow key={p.id} participant={p} onModerate={onModerate} />
            ))}
            {session.participants.length === 0 ? (
              <li style={{ color: '#9aa7b5', fontSize: 13 }}>No one is in the room yet.</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function ParticipantRow({
  participant,
  onModerate,
}: {
  participant: MeetingParticipant;
  onModerate?: MeetingViewProps['onModerate'];
}) {
  const isAgent =
    participant.kind === 'agent' ||
    participant.kind === 'virtual_agent' ||
    participant.kind === 'asset_agent';
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 8,
        background: '#151b22',
        border: '1px solid #232c36',
      }}
    >
      <strong style={{ fontSize: 13 }}>{participant.displayName}</strong>
      <span style={{ fontSize: 11, color: '#6b7784' }}>
        {isAgent ? 'agent' : 'user'} · {participant.transport}
        {participant.muted ? ' · muted' : ''}
        {!participant.listening ? ' · listening off' : ''}
      </span>
      <span style={{ flex: 1 }} />
      {onModerate ? (
        <>
          <button
            type="button"
            style={{ ...btn, padding: '2px 8px' }}
            onClick={() => onModerate(participant.id, 'mute', !participant.muted)}
          >
            {participant.muted ? 'Unmute' : 'Mute'}
          </button>
          {isAgent ? (
            <button
              type="button"
              style={{ ...btn, padding: '2px 8px' }}
              onClick={() => onModerate(participant.id, 'disable-listening', participant.listening)}
            >
              {participant.listening ? 'Disable listening' : 'Enable listening'}
            </button>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
