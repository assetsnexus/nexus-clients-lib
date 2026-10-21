import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  availableVoiceModes,
  endpointTlsWarning,
  preferredVoiceMode,
  resolveVoiceEngineEndpoint,
  voiceModeUnavailableReason,
  type MeetingSceneOccupant,
  type MeetingVoiceCapabilities,
  type MeetingVoiceMode,
  type VoiceEngineEndpointInput,
} from '@nexus/meetings-core';

export type MeetingVoiceBarProps = {
  capabilities: MeetingVoiceCapabilities;
  /** Currently selected mode; when omitted the preferred mode is shown active. */
  mode?: MeetingVoiceMode | null;
  /** Live session state from the host voice runtime. */
  active?: boolean;
  statusText?: string;
  muted?: boolean;
  /** True after a realtime attempt failed and the host fell back to pipeline. */
  fellBack?: boolean;
  /** Host prefers the local engines (on-device audio). */
  preferLocal?: boolean;
  onSelectMode?: (mode: MeetingVoiceMode) => void;
  onTogglePreferLocal?: (preferLocal: boolean) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
};

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  padding: '8px 10px',
  borderRadius: 10,
  background: '#151b22',
  border: '1px solid #232c36',
};

const btn = (active: boolean): CSSProperties => ({
  padding: '5px 10px',
  borderRadius: 8,
  border: `1px solid ${active ? '#3f6cb0' : '#3a4654'}`,
  background: active ? '#2f5c9e' : '#1c2430',
  color: active ? '#fff' : '#e8eef4',
  cursor: 'pointer',
  fontSize: 12,
});

/**
 * Meeting voice bar (Phase 11e).
 *
 * One control surface for the two real-time voice modes shared with the portal
 * chat — `realtime` (WebRTC `gpt-realtime`) and `pipeline` (STT → agent → TTS,
 * optionally with on-device engines). Availability is derived from capabilities
 * so a mode the region cannot serve is disabled with an honest reason, and a
 * realtime→pipeline fallback is surfaced rather than hidden.
 */
export function MeetingVoiceBar({
  capabilities,
  mode,
  active,
  statusText,
  muted,
  fellBack,
  preferLocal,
  onSelectMode,
  onTogglePreferLocal,
  onStart,
  onEnd,
  onToggleMute,
}: MeetingVoiceBarProps) {
  const modes = useMemo(() => availableVoiceModes(capabilities), [capabilities]);
  const selected = mode ?? preferredVoiceMode(capabilities);

  return (
    <div style={bar}>
      <span style={{ fontSize: 12, color: '#9aa7b5' }}>Voice</span>
      {(['realtime', 'pipeline'] as const).map((m) => {
        const available = modes.includes(m);
        const reason = available ? null : voiceModeUnavailableReason(capabilities, m);
        return (
          <button
            key={m}
            type="button"
            style={{ ...btn(selected === m), opacity: available ? 1 : 0.5 }}
            disabled={!available}
            title={reason ?? undefined}
            onClick={() => onSelectMode?.(m)}
          >
            {m === 'realtime' ? 'Realtime (WebRTC)' : 'STT / TTS'}
          </button>
        );
      })}

      {selected === 'pipeline' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9aa7b5' }}>
          <input
            type="checkbox"
            checked={Boolean(preferLocal)}
            onChange={(e) => onTogglePreferLocal?.(e.target.checked)}
          />
          Prefer on-device engines
        </label>
      ) : null}

      <span style={{ flex: 1 }} />
      {fellBack ? <span style={{ fontSize: 11, color: '#fbbf24' }}>Fell back to STT/TTS</span> : null}
      {statusText ? <span style={{ fontSize: 11, color: '#6b7784' }}>{statusText}</span> : null}
      {active ? (
        <>
          <button type="button" style={btn(false)} onClick={onToggleMute}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" style={btn(false)} onClick={onEnd}>
            End
          </button>
        </>
      ) : (
        <button type="button" style={btn(true)} disabled={!selected} onClick={onStart}>
          {selected ? 'Start call' : 'Voice unavailable'}
        </button>
      )}
    </div>
  );
}

export type MeetingSceneTabProps = {
  occupants: MeetingSceneOccupant[];
  /**
   * The host renders the 3D scene here (e.g. `ClusterRoomViewer` /
   * `SceneRoomCanvas` from `@nexus/character-react`). When omitted, the tab
   * shows the occupant roster as a status list so a host without a 3D renderer
   * still surfaces who is present and who is speaking.
   */
  sceneRenderer?: ReactNode;
  voice?: MeetingVoiceBarProps;
  /** Optional per-occupant action (e.g. frame the camera on an agent). */
  onFocusOccupant?: (occupantId: string) => void;
  emptyHint?: string;
};

const chip = (occupant: MeetingSceneOccupant): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 999,
  border: `1px solid #${occupant.statusColor.toString(16).padStart(6, '0')}`,
  background: '#12171c',
  color: '#e8eef4',
  fontSize: 12,
});

/**
 * Meeting `Scene` tab (Phase 11e).
 *
 * Reuses the same agent embodiment rail as DMs: the host projects the room
 * roster + presence into {@link MeetingSceneOccupant}s and renders the cluster
 * scene. This component owns the shared chrome (occupant chips + voice bar), so
 * portal, desktop, and external apps present the scene identically.
 */
export function MeetingSceneTab({
  occupants,
  sceneRenderer,
  voice,
  onFocusOccupant,
  emptyHint,
}: MeetingSceneTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {voice ? <MeetingVoiceBar {...voice} /> : null}
      {sceneRenderer ?? (
        <div style={{ padding: 12, borderRadius: 10, background: '#12171c', border: '1px solid #232c36' }}>
          <p style={{ margin: 0, color: '#9aa7b5', fontSize: 12 }}>
            {emptyHint ?? 'No 3D scene is bound to this room.'}
          </p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {occupants.map((o) => (
          <button
            key={o.id}
            type="button"
            style={chip(o)}
            title={o.present ? undefined : 'No verified avatar — showing a status stand-in'}
            onClick={() => onFocusOccupant?.(o.id)}
          >
            <span>{o.label}</span>
            {o.agent ? <span style={{ color: '#b07cff' }}>agent</span> : null}
            {o.speaking ? <span aria-label="speaking">🔊</span> : null}
            {!o.present ? <span style={{ color: '#6b7784' }}>·</span> : null}
          </button>
        ))}
        {occupants.length === 0 ? (
          <span style={{ fontSize: 12, color: '#6b7784' }}>No participants in the scene yet.</span>
        ) : null}
      </div>
    </div>
  );
}

/** Re-export for hosts building a custom endpoint editor. */
export { endpointTlsWarning, resolveVoiceEngineEndpoint, type VoiceEngineEndpointInput };
