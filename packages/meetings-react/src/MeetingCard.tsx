import type { CSSProperties } from 'react';
import {
  resolveOpenTarget,
  type MeetingCardModel,
} from '@nexus/meetings-core';

export type MeetingCardProps = {
  card: MeetingCardModel;
  /** Called when the user clicks the card. Defaults to window.open for external. */
  onOpen?: (card: MeetingCardModel) => void;
  /** Called for a nexus-room meeting so the host can route in-app. */
  onOpenRoom?: (roomId: string, card: MeetingCardModel) => void;
  compact?: boolean;
};

const providerTint: Record<string, string> = {
  nexus: '#7aa2f7',
  zoom: '#4a9eff',
  teams: '#8b8bf5',
  google_meet: '#4ade80',
  webex: '#38bdf8',
  custom: '#a78bfa',
  in_person: '#94a3b8',
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 12px',
  borderRadius: 10,
  background: '#151b22',
  border: '1px solid #2a333d',
  color: '#e8eef4',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  cursor: 'pointer',
  textAlign: 'left',
};

function formatRange(card: MeetingCardModel): string {
  if (card.allDay) return 'All day';
  const start = new Date(card.startsAt);
  const end = new Date(card.endsAt);
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

/**
 * Shared meeting card (Phase 11).
 *
 * One card for every host — portal, mobile, desktop, external nexus apps — so
 * a meeting renders and routes identically. Clicking routes via
 * `resolveOpenTarget`: nexus rooms open in-app, provider URLs open externally,
 * custom/in-person meetings show their description.
 */
export function MeetingCard({ card, onOpen, onOpenRoom, compact }: MeetingCardProps) {
  const target = resolveOpenTarget(card);

  function handleClick() {
    if (onOpen) {
      onOpen(card);
      return;
    }
    if (target.kind === 'room') {
      onOpenRoom?.(target.roomId, card);
      return;
    }
    if (target.kind === 'external' && typeof window !== 'undefined') {
      window.open(target.url, '_blank', 'noopener,noreferrer');
    }
  }

  const clickable = card.clickable;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={handleClick}
      style={{
        ...cardStyle,
        borderLeft: `3px solid ${providerTint[card.provider] ?? '#94a3b8'}`,
        opacity: card.cancelled ? 0.55 : 1,
        cursor: clickable ? 'pointer' : 'default',
        textDecoration: card.cancelled ? 'line-through' : 'none',
      }}
    >
      <strong style={{ fontSize: compact ? 12 : 14 }}>{card.title}</strong>
      <span style={{ fontSize: 12, color: '#9aa7b5' }}>
        {formatRange(card)} · {card.providerLabel}
        {target.kind === 'describe' && card.description ? ` · ${card.description}` : ''}
      </span>
      {card.myStatus === 'needs_action' ? (
        <span style={{ fontSize: 11, color: '#fbbf24' }}>Awaiting your reply</span>
      ) : null}
    </button>
  );
}
