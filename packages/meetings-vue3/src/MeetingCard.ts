import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import {
  resolveOpenTarget,
  type MeetingCardModel,
  type MeetingOpenTarget,
} from '@nexus/meetings-core';

const TINT: Record<string, string> = {
  nexus: '#7aa2f7',
  zoom: '#4a9eff',
  teams: '#8b8bf5',
  google_meet: '#4ade80',
  webex: '#38bdf8',
  custom: '#a78bfa',
  in_person: '#94a3b8',
};

function formatRange(card: MeetingCardModel): string {
  if (card.allDay) return 'All day';
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const start = new Date(card.startsAt).toLocaleTimeString(undefined, opts);
  const end = new Date(card.endsAt).toLocaleTimeString(undefined, opts);
  return `${start} – ${end}`;
}

/**
 * Shared meeting card (Phase 11) — Vue 3 adapter.
 *
 * Same projection and routing as `@nexus/meetings-react`'s `MeetingCard`.
 * Emits `open` with the `MeetingCardModel` and `open-room` with the room id so
 * hosts can route in-app; with no listeners attached, external URLs open via
 * `window.open`.
 */
export const MeetingCard = defineComponent({
  name: 'NexusMeetingCard',
  props: {
    card: { type: Object as PropType<MeetingCardModel>, required: true },
    compact: { type: Boolean, default: false },
    /** Overrides the default open behavior entirely. */
    onOpen: { type: Function as PropType<(card: MeetingCardModel) => void>, default: undefined },
    /** Overrides room routing. */
    onOpenRoom: { type: Function as PropType<(roomId: string, card: MeetingCardModel) => void>, default: undefined },
  },
  emits: ['open', 'open-room'],
  setup(props, { emit }) {
    return (): VNodeChild => {
      const card = props.card;
      const target: MeetingOpenTarget = resolveOpenTarget(card);
      const clickable = card.clickable;

      const handleClick = (): void => {
        emit('open', card);
        if (props.onOpen) {
          props.onOpen(card);
          return;
        }
        if (target.kind === 'room') {
          emit('open-room', target.roomId, card);
          props.onOpenRoom?.(target.roomId, card);
          return;
        }
        if (target.kind === 'external' && typeof window !== 'undefined') {
          window.open(target.url, '_blank', 'noopener,noreferrer');
        }
      };

      const children: VNodeChild[] = [
        h('strong', { style: `font-size:${props.compact ? 12 : 14}px` }, card.title),
        h(
          'span',
          { style: 'font-size:12px;color:#9aa7b5' },
          `${formatRange(card)} · ${card.providerLabel}${
            target.kind === 'describe' && card.description ? ` · ${card.description}` : ''
          }`,
        ),
      ];
      if (card.myStatus === 'needs_action') {
        children.push(h('span', { style: 'font-size:11px;color:#fbbf24' }, 'Awaiting your reply'));
      }

      return h(
        'button',
        {
          type: 'button',
          disabled: !clickable,
          onClick: handleClick,
          style: `display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;background:#151b22;color:#e8eef4;text-align:left;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid #2a333d;border-left:3px solid ${
            TINT[card.provider] ?? '#94a3b8'
          };opacity:${card.cancelled ? 0.55 : 1};cursor:${clickable ? 'pointer' : 'default'};text-decoration:${
            card.cancelled ? 'line-through' : 'none'
          }`,
        },
        children,
      );
    };
  },
});
