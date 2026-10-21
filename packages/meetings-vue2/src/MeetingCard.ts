import Vue, { type CreateElement, type VNode } from 'vue';
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
 * Shared meeting card (Phase 11) — Vue 2.7 adapter.
 *
 * Same projection and routing as `@nexus/meetings-react`'s `MeetingCard`.
 * Emits `open` (card) and `open-room` (roomId, card). With no listeners,
 * external URLs open via `window.open`.
 */
export const MeetingCard = Vue.extend({
  name: 'NexusMeetingCard',
  props: {
    card: { type: Object as () => MeetingCardModel, required: true },
    compact: { type: Boolean, default: false },
    onOpen: { type: Function as unknown as () => (card: MeetingCardModel) => void, default: undefined },
    onOpenRoom: {
      type: Function as unknown as () => (roomId: string, card: MeetingCardModel) => void,
      default: undefined,
    },
  },
  methods: {
    handleClick(this: Record<string, any>): void {
      const card = this.card as MeetingCardModel;
      this.$emit('open', card);
      if (this.onOpen) {
        (this.onOpen as (c: MeetingCardModel) => void)(card);
        return;
      }
      const target: MeetingOpenTarget = resolveOpenTarget(card);
      if (target.kind === 'room') {
        this.$emit('open-room', target.roomId, card);
        (this.onOpenRoom as ((roomId: string, c: MeetingCardModel) => void) | undefined)?.(target.roomId, card);
        return;
      }
      if (target.kind === 'external' && typeof window !== 'undefined') {
        window.open(target.url, '_blank', 'noopener,noreferrer');
      }
    },
  },
  render(this: Record<string, any>, h: CreateElement): VNode {
    const card = this.card as MeetingCardModel;
    const target = resolveOpenTarget(card);
    const clickable = card.clickable;

    const children: VNode[] = [
      h('strong', { style: `font-size:${this.compact ? 12 : 14}px` }, card.title),
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
        attrs: { type: 'button', disabled: !clickable },
        on: { click: this.handleClick },
        style: `display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;background:#151b22;color:#e8eef4;text-align:left;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid #2a333d;border-left:3px solid ${
          TINT[card.provider] ?? '#94a3b8'
        };opacity:${card.cancelled ? 0.55 : 1};cursor:${clickable ? 'pointer' : 'default'};text-decoration:${
          card.cancelled ? 'line-through' : 'none'
        }`,
      },
      children,
    );
  },
});
