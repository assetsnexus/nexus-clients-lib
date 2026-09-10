import {
  formatModeTransitionCountdown,
  modeLabel,
  type ChatExecutionMode,
  type ChatToolRun,
  type ModeTransitionState,
} from '@nexus/chat-core';

const RING_SIZE = 18;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export type ModeBlockedResult = {
  status: 'mode_blocked';
  code: 'mode_blocked';
  mode: ChatExecutionMode | string;
  required: ChatExecutionMode | string;
  message: string;
};

function modeBlockedResult(run: ChatToolRun): ModeBlockedResult | null {
  const r = run?.result as Partial<ModeBlockedResult> | undefined;
  if (!r || typeof r !== 'object' || r.status !== 'mode_blocked' || typeof r.required !== 'string') {
    return null;
  }
  return r as ModeBlockedResult;
}

/**
 * P8-8: renders a `mode_blocked` tool run as a terminal refusal — never a
 * checkmark, never an approval prompt. The "Switch to {required} mode"
 * action drives the SAME shared `useModeTransition` instance the chrome
 * chip and message badge use (via the `modeTransition` / `onSwitchMode`
 * props threaded down from NexusChatPanel), so an agent-initiated retry
 * looks identical to a user-initiated mode change.
 */
export const ModeRefusalChipWidget = {
  name: 'NexusModeRefusalChipWidget',
  props: {
    run: { type: Object, required: true },
    /** Shared transition state from the panel-level `useModeTransition` controller. */
    modeTransition: { type: Object, default: null },
    /** True while this widget's own click is awaiting the mode-switch dispatch. */
    dispatching: { type: Boolean, default: false },
  },
  data() {
    return {
      /** Set once this widget's own action completed a switch — sticky confirmation. */
      switchedTo: null as string | null,
    };
  },
  computed: {
    blocked(): ModeBlockedResult | null {
      return modeBlockedResult(this.run as ChatToolRun);
    },
    transition(): ModeTransitionState | null {
      return (this.modeTransition as ModeTransitionState | null) || null;
    },
    isThisTransitionActive(): boolean {
      const t = this.transition;
      const blocked = this.blocked;
      return Boolean(t && blocked && t.to === blocked.required && t.phase !== 'idle');
    },
    anyTransitionActive(): boolean {
      return Boolean(this.transition && this.transition.phase !== 'idle');
    },
  },
  watch: {
    isThisTransitionActive(active: boolean, wasActive: boolean) {
      // Transition for our target settled — remember it so the button never
      // reappears for a call that already resolved (retrying is the model's
      // job on the next turn, not a re-click of stale history).
      if (wasActive && !active && this.blocked) {
        this.switchedTo = this.blocked.required;
      }
    },
  },
  render(h: any) {
    const blocked = this.blocked;
    if (!blocked) return null;
    const requiredLabel = modeLabel(blocked.required);
    const currentLabel = modeLabel(blocked.mode);

    const ring = this.isThisTransitionActive
      ? this.renderRing(h, this.transition!)
      : null;

    const actionRow = this.switchedTo
      ? h('span', { class: 'nexus-mode-refusal__switched text-muted small' }, [
          `Switched to ${modeLabel(this.switchedTo)} mode — resend to retry.`,
        ])
      : h('div', { class: 'nexus-mode-refusal__action' }, [
          ring ||
            h(
              'button',
              {
                class: 'btn btn-sm btn-outline-warning',
                attrs: {
                  type: 'button',
                  disabled: this.dispatching || this.anyTransitionActive,
                },
                on: {
                  click: () =>
                    this.$emit('switch-mode', {
                      required: blocked.required,
                      mode: blocked.mode,
                      callId: (this.run as ChatToolRun).id,
                    }),
                },
              },
              `Switch to ${requiredLabel} mode`,
            ),
        ]);

    return h('div', { class: 'nexus-mode-refusal' }, [
      h('div', { class: 'nexus-mode-refusal__row' }, [
        h('span', { class: 'nexus-mode-refusal__badge' }, 'Blocked'),
        h('span', { class: 'nexus-mode-refusal__text' }, [
          blocked.message || `This action needs ${requiredLabel} mode (currently ${currentLabel}).`,
        ]),
      ]),
      actionRow,
    ]);
  },
  methods: {
    renderRing(h: any, t: ModeTransitionState) {
      const dashOffset = RING_CIRCUMFERENCE * (1 - t.progress);
      return h('span', { class: 'nexus-mode-transition' }, [
        t.phase === 'transitioning'
          ? h(
              'span',
              {
                class: 'nexus-mode-transition__ring',
                style: { width: RING_SIZE + 'px', height: RING_SIZE + 'px' },
              },
              [
                h(
                  'svg',
                  { attrs: { width: RING_SIZE, height: RING_SIZE }, class: 'nexus-mode-transition__svg' },
                  [
                    h('circle', {
                      attrs: {
                        cx: RING_SIZE / 2,
                        cy: RING_SIZE / 2,
                        r: RING_RADIUS,
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': RING_STROKE,
                      },
                      class: 'nexus-checkback__track',
                    }),
                    h('circle', {
                      attrs: {
                        cx: RING_SIZE / 2,
                        cy: RING_SIZE / 2,
                        r: RING_RADIUS,
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': RING_STROKE,
                        'stroke-linecap': 'round',
                        'stroke-dasharray': String(RING_CIRCUMFERENCE),
                        'stroke-dashoffset': String(dashOffset),
                      },
                      class: 'nexus-mode-transition__progress',
                    }),
                  ],
                ),
              ],
            )
          : null,
        h('span', { class: 'nexus-mode-transition__labels' }, [
          h('span', { class: 'nexus-mode-transition__from' }, modeLabel(t.from)),
          h('span', { class: 'nexus-mode-transition__arrow' }, '→'),
          h('span', { class: 'nexus-mode-transition__to' }, modeLabel(t.to)),
          t.phase === 'transitioning'
            ? h('span', { class: 'nexus-mode-transition__countdown' }, formatModeTransitionCountdown(t.remainingMs))
            : null,
        ]),
      ]);
    },
  },
};

export default ModeRefusalChipWidget;
