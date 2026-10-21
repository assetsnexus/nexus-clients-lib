import { defineComponent, h, ref, type PropType, type VNodeChild } from 'vue';
import {
  agentParticipantCount,
  meetingViewTabs,
  type MeetingCardModel,
  type MeetingParticipant,
  type RoomMediaSession,
} from '@nexus/meetings-core';

const BTN =
  'padding:5px 10px;border-radius:8px;border:1px solid #3a4654;background:#1c2430;color:#e8eef4;cursor:pointer;font-size:12px';

function isAgent(p: MeetingParticipant): boolean {
  return p.kind === 'agent' || p.kind === 'virtual_agent' || p.kind === 'asset_agent';
}

/**
 * Meeting view (Phase 11) — Vue 3 adapter.
 *
 * Mirrors `@nexus/meetings-react`'s `MeetingView`: capability-gated tabs drawn
 * from the shared core rule (`meetingViewTabs`) so every host shows the same
 * surfaces. Slots: `video`, `scene`.
 */
export const MeetingView = defineComponent({
  name: 'NexusMeetingView',
  props: {
    card: { type: Object as PropType<MeetingCardModel>, required: true },
    session: { type: Object as PropType<RoomMediaSession>, required: true },
    onModerate: {
      type: Function as PropType<
        (id: string, action: 'mute' | 'disable-listening' | 'set-volume', value: boolean | number) => void
      >,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const active = ref<string | undefined>(undefined);
    return (): VNodeChild => {
      const tabs = meetingViewTabs(props.card);
      const current = active.value ?? tabs[0] ?? 'participants';
      const agents = agentParticipantCount(props.session);

      const tabButtons = tabs.map((tab) =>
        h(
          'button',
          {
            type: 'button',
            key: tab,
            style: `${BTN};text-transform:capitalize;${current === tab ? 'background:#243244;' : ''}`,
            onClick: () => {
              active.value = tab;
            },
          },
          tab,
        ),
      );

      const row = (p: MeetingParticipant): VNodeChild => {
        const controls: VNodeChild[] = [];
        if (props.onModerate) {
          controls.push(
            h(
              'button',
              { type: 'button', style: `${BTN};padding:2px 8px;`, onClick: () => props.onModerate!(p.id, 'mute', !p.muted) },
              p.muted ? 'Unmute' : 'Mute',
            ),
          );
          if (isAgent(p)) {
            controls.push(
              h(
                'button',
                {
                  type: 'button',
                  style: `${BTN};padding:2px 8px;`,
                  onClick: () => props.onModerate!(p.id, 'disable-listening', p.listening),
                },
                p.listening ? 'Disable listening' : 'Enable listening',
              ),
            );
          }
        }
        return h(
          'li',
          {
            key: p.id,
            style:
              'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#151b22;border:1px solid #232c36',
          },
          [
            h('strong', { style: 'font-size:13px' }, p.displayName),
            h(
              'span',
              { style: 'font-size:11px;color:#6b7784' },
              `${isAgent(p) ? 'agent' : 'user'} · ${p.transport}${p.muted ? ' · muted' : ''}${
                !p.listening ? ' · listening off' : ''
              }`,
            ),
            h('span', { style: 'flex:1' }),
            ...controls,
          ],
        );
      };

      let body: VNodeChild;
      if (current === 'video') {
        body = slots.video?.() ?? h('p', { style: 'color:#9aa7b5' }, 'Video surface unavailable.');
      } else if (current === 'screenshare') {
        body = h('p', { style: 'color:#9aa7b5' }, 'Screenshare surface.');
      } else if (current === 'scene') {
        body = slots.scene?.() ?? h('p', { style: 'color:#9aa7b5' }, 'No 3D scene bound to this room.');
      } else {
        body = props.session.participants.length
          ? h(
              'ul',
              { style: 'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px' },
              props.session.participants.map(row),
            )
          : h('p', { style: 'color:#9aa7b5;font-size:13px' }, 'No one is in the room yet.');
      }

      return h(
        'div',
        {
          style:
            'display:flex;flex-direction:column;height:100%;min-height:0;background:#0b0f14;color:#e8eef4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        },
        [
          h('div', { style: 'display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #1e2731' }, [
            ...tabButtons,
            h('span', { style: 'flex:1' }),
            props.card.provider === 'nexus' && agents > 0
              ? h('span', { style: 'font-size:11px;color:#9aa7b5' }, `${agents} agent(s)`)
              : null,
          ]),
          h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px' }, [body]),
        ],
      );
    };
  },
});
