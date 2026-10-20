import { defineComponent, h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

import { modeLabel, type PendingPauseCard } from '@nexus/chat-core';

/**
 * One-click cards for the three pending-pause rails (Plan-write approval, mode
 * switch, gated client tool). Emits `resolve` with the rail + decision; the host
 * calls `chat.resolveApproval` / `chat.resolveModeSwitch` / and for a
 * `client_tool` card `chat.approveClientTool` (runs the handler and resumes with
 * its real result) / `chat.answerClientToolPause`.
 */
export const PendingPauseCardWidget = defineComponent({
  name: 'NexusPendingPauseCardWidget',
  props: {
    card: { type: Object, required: true },
    busy: { type: Boolean, default: false },
  },
  computed: {
    c(): PendingPauseCard {
      return this.card as PendingPauseCard;
    },
    title(): string {
      const c = this.c;
      if (c.kind === 'approval') return 'Approval needed';
      if (c.kind === 'mode_switch') return 'Switch mode?';
      return 'Client tool needs approval';
    },
    subtitle(): string {
      const c = this.c;
      if (c.kind === 'approval') {
        return [c.command, c.mutationClass, c.mode ? `${modeLabel(c.mode)} mode` : '']
          .filter(Boolean)
          .join(' · ');
      }
      if (c.kind === 'mode_switch') return `${modeLabel(c.from)} → ${modeLabel(c.to)}${c.reason ? ` · ${c.reason}` : ''}`;
      return c.name;
    },
    primaryLabel(): string {
      const c = this.c;
      if (c.kind === 'mode_switch') return `Switch to ${modeLabel(c.to)}`;
      return 'Approve';
    },
  },
  methods: {
    resolve(decision: Record<string, unknown>) {
      this.$emit('resolve', { card: this.c, decision });
    },
  },
  render(_h: any) {
    const c = this.c;
    return h('div', { class: 'nexus-chat__grant-card nexus-pending-pause' }, [
      h('strong', {}, [this.title]),
      h('div', { class: 'nexus-chat__muted' }, [this.subtitle]),
      c.kind !== 'mode_switch'
        ? h('pre', { class: 'nexus-chat__viewer-pre' }, [
            JSON.stringify((c as any).preview ?? c.arguments ?? {}, null, 2),
          ])
        : null,
      h('div', { class: 'nexus-chat__grant-actions' }, [
        h(
          'button',
          {
            class: 'btn btn-sm btn-primary',
            attrs: { type: 'button', disabled: this.busy },
            on: { click: () => this.resolve({ approved: true }) },
          },
          [this.primaryLabel],
        ),
        c.kind === 'approval'
          ? h(
              'button',
              {
                class: 'btn btn-sm btn-outline-secondary',
                attrs: { type: 'button', disabled: this.busy },
                on: { click: () => this.resolve({ approved: true, switchToMode: 'agent' }) },
              },
              ['Continue in Agent mode'],
            )
          : null,
        h(
          'button',
          {
            class: 'btn btn-sm btn-outline-secondary',
            attrs: { type: 'button', disabled: this.busy },
            on: { click: () => this.resolve({ approved: false }) },
          },
          [c.kind === 'mode_switch' ? `Stay in ${modeLabel(c.from)}` : 'Decline'],
        ),
      ]),
    ]);
  },
});

export default PendingPauseCardWidget;
