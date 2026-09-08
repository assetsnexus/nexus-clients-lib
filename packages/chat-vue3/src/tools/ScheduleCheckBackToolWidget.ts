import { h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

import {
  checkBackProgress,
  checkBackRemainingMs,
  formatCheckBackCountdown,
  isCheckBackOverdue,
  isCheckBackTriggerSettledError,
  isCheckBackWaiting,
  parseScheduleCheckBackResult,
  type ChatToolRun,
  type ScheduleCheckBackResult,
} from '@nexus/chat-core';

const RING_SIZE = 72;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * schedule_check_back countdown + manual/auto trigger via triggerCheckBack prop.
 */
export const ScheduleCheckBackToolWidget = {
  name: 'NexusScheduleCheckBackToolWidget',
  props: {
    run: { type: Object, required: true },
    conversationId: { type: String, default: null },
    triggerCheckBack: { type: Function, default: null },
  },
  data() {
    return {
      nowMs: Date.now(),
      triggering: false,
      error: null as string | null,
      tickId: null as number | null,
      pollId: null as number | null,
      autoAttempted: false,
      resumeInFlight: false,
    };
  },
  computed: {
    parsed(): ScheduleCheckBackResult | null {
      return parseScheduleCheckBackResult((this.run as ChatToolRun).result);
    },
    waiting(): boolean {
      return this.parsed ? isCheckBackWaiting(this.parsed, this.nowMs) : false;
    },
    overdue(): boolean {
      return this.parsed ? isCheckBackOverdue(this.parsed, this.nowMs) : false;
    },
    remainingMs(): number {
      return this.parsed ? checkBackRemainingMs(this.parsed, this.nowMs) : 0;
    },
    progress(): number {
      return this.parsed ? checkBackProgress(this.parsed, this.nowMs) : 0;
    },
    canResumeNow(): boolean {
      return Boolean(
        this.conversationId &&
          this.triggerCheckBack &&
          this.waiting &&
          !this.triggering &&
          this.parsed &&
          !this.parsed.wakeUp,
      );
    },
  },
  watch: {
    run: {
      deep: true,
      handler() {
        this.autoAttempted = false;
        this.error = null;
        this.setupTimers();
      },
    },
  },
  mounted() {
    this.setupTimers();
  },
  beforeUnmount() {
    this.clearTimers();
  },
  methods: {
    clearTimers() {
      if (this.tickId != null) window.clearInterval(this.tickId);
      if (this.pollId != null) window.clearInterval(this.pollId);
      this.tickId = null;
      this.pollId = null;
    },
    setupTimers() {
      this.clearTimers();
      if (!this.parsed || this.parsed.wakeUp) return;
      if (isCheckBackWaiting(this.parsed)) {
        this.tickId = window.setInterval(() => {
          this.nowMs = Date.now();
          this.maybeAutoTrigger();
        }, 250);
      }
      if (this.overdue) {
        this.pollId = window.setInterval(() => {
          this.$emit('resume-complete');
        }, 3000);
      }
      this.maybeAutoTrigger();
    },
    maybeAutoTrigger() {
      if (
        !this.parsed ||
        this.parsed.wakeUp ||
        this.autoAttempted ||
        !isCheckBackOverdue(this.parsed, this.nowMs) ||
        !this.conversationId ||
        !this.triggerCheckBack
      ) {
        return;
      }
      this.autoAttempted = true;
      void this.doTrigger({ manual: false });
    },
    async doTrigger(opts: { manual?: boolean } = {}) {
      if (!this.conversationId || !this.triggerCheckBack || this.resumeInFlight) return;
      this.resumeInFlight = true;
      if (opts.manual) this.triggering = true;
      this.error = null;
      try {
        await this.triggerCheckBack(this.conversationId);
        this.$emit('resume-complete');
      } catch (err) {
        if (isCheckBackTriggerSettledError(err)) {
          this.$emit('resume-complete');
        } else {
          this.error = err instanceof Error ? err.message : 'Could not resume now';
        }
      } finally {
        this.resumeInFlight = false;
        if (opts.manual) this.triggering = false;
      }
    },
  },
  render(_h: any) {
    if (!this.parsed) return null;
    const dashOffset = RING_CIRCUMFERENCE * (1 - this.progress);
    const tone = this.parsed.wakeUp
      ? 'nexus-checkback--done'
      : this.overdue
        ? 'nexus-checkback--overdue'
        : 'nexus-checkback--waiting';

    const center = this.parsed.wakeUp
      ? h('span', { class: 'nexus-checkback__icon' }, '✓')
      : this.overdue
        ? h('span', { class: 'nexus-checkback__icon nexus-checkback__spin' }, '…')
        : h(
            'span',
            { class: 'nexus-checkback__countdown' },
            formatCheckBackCountdown(this.remainingMs / 1000),
          );

    return h('div', { class: ['nexus-checkback', tone] }, [
      h('div', { class: 'nexus-checkback__row' }, [
        h(
          'div',
          {
            class: 'nexus-checkback__ring',
            style: { width: RING_SIZE + 'px', height: RING_SIZE + 'px' },
          },
          [
            h(
              'svg',
              {
                attrs: { width: RING_SIZE, height: RING_SIZE },
                class: 'nexus-checkback__svg',
              },
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
                !this.parsed.wakeUp
                  ? h('circle', {
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
                      class: 'nexus-checkback__progress',
                    })
                  : null,
              ],
            ),
            h('div', { class: 'nexus-checkback__center' }, [center]),
          ],
        ),
        h('div', { class: 'nexus-checkback__body' }, [
          h('div', { class: 'small text-muted text-uppercase' }, [
            this.parsed.wakeUp
              ? 'Check-back complete'
              : this.overdue
                ? 'Resuming agent…'
                : 'Scheduled check-back',
          ]),
          h('p', { class: 'mb-1' }, this.parsed.reason),
          h('p', { class: 'small text-muted mb-0' }, [
            this.parsed.wakeUp
              ? this.parsed.message || 'The agent picked up where it left off.'
              : this.overdue
                ? 'Waiting for the agent to continue…'
                : `Agent will resume in ${formatCheckBackCountdown(this.remainingMs / 1000)}`,
          ]),
        ]),
      ]),
      this.canResumeNow
        ? h(
            'button',
            {
              class: 'btn btn-outline-primary btn-sm btn-block mt-2',
              attrs: { type: 'button', disabled: this.triggering },
              on: { click: () => this.doTrigger({ manual: true }) },
            },
            this.triggering ? 'Resuming…' : 'Resume now',
          )
        : null,
      this.error ? h('p', { class: 'text-danger small mb-0 mt-1' }, this.error) : null,
    ]);
  },
};

export default ScheduleCheckBackToolWidget;
