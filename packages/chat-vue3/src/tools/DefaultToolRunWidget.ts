import { h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

import type { ChatToolRun } from '@nexus/chat-core';
import { formatToolRunDisplay } from './tool-run-display';
import { resolveToolAccessKind, toolStatusClass, toolStatusLabel } from './shared';

/**
 * Compact expandable tool run row with approve/revert actions.
 */
export const DefaultToolRunWidget = {
  name: 'NexusDefaultToolRunWidget',
  props: {
    run: { type: Object, required: true },
    canViewToolDetails: { type: Boolean, default: true },
    /** When set, dims completed rows in the live compact strip. */
    fadeLevel: { type: Number, default: 0 },
  },
  data() {
    const run = this.run as ChatToolRun;
    return {
      expanded: run.status === 'error' || run.status === 'needs_approval',
    };
  },
  computed: {
    showApproval(): boolean {
      const run = this.run as ChatToolRun;
      return !!(run.approvalRequired || run.status === 'needs_approval');
    },
    display(): ReturnType<typeof formatToolRunDisplay> {
      return formatToolRunDisplay(this.run as ChatToolRun);
    },
    statusText(): string {
      return toolStatusLabel((this.run as ChatToolRun).status);
    },
    accessKind(): ReturnType<typeof resolveToolAccessKind> {
      return resolveToolAccessKind(this.run as ChatToolRun);
    },
  },
  render(h: any) {
    const run = this.run as ChatToolRun;
    const fade = Math.min(2, Math.max(0, Number(this.fadeLevel) || 0));
    const access = this.accessKind;
    return h(
      'div',
      {
        class: [
          'nexus-tool-run',
          toolStatusClass(run.status),
          this.expanded ? 'nexus-tool-run--open' : '',
          fade === 1 ? 'nexus-tool-run--fade-1' : '',
          fade === 2 ? 'nexus-tool-run--fade-2' : '',
          access === 'write' ? 'nexus-tool-run--write' : '',
          access === 'read' ? 'nexus-tool-run--read' : '',
        ],
      },
      [
        h(
          'button',
          {
            class: 'nexus-tool-run__header',
            attrs: {
              type: 'button',
              disabled: !this.canViewToolDetails,
              title: this.display.tooltip || run.tool || run.label || undefined,
            },
            on: {
              click: () => {
                if (this.canViewToolDetails) this.expanded = !this.expanded;
              },
            },
          },
          [
            h('span', {
              class: [
                'nexus-tool-run__dot',
                toolStatusClass(run.status),
                access === 'write' ? 'is-write' : '',
              ],
              attrs: { 'aria-hidden': 'true' },
            }),
            h('span', { class: 'nexus-tool-run__titles' }, [
              h('span', { class: 'nexus-tool-run__title' }, this.display.title),
              this.display.subtitle
                ? h('span', { class: 'nexus-tool-run__subtitle' }, this.display.subtitle)
                : null,
            ]),
            h(
              'span',
              { class: ['nexus-tool-run__chip', toolStatusClass(run.status)] },
              this.statusText,
            ),
            this.canViewToolDetails
              ? h(
                  'span',
                  { class: 'nexus-tool-run__chev', attrs: { 'aria-hidden': 'true' } },
                  this.expanded ? '▾' : '▸',
                )
              : null,
          ],
        ),
        this.showApproval
          ? h('div', { class: 'nexus-tool-run__actions' }, [
              h(
                'button',
                {
                  class: 'nexus-tool-run__btn nexus-tool-run__btn--ok',
                  attrs: { type: 'button' },
                  on: { click: () => this.$emit('approve', run) },
                },
                'Approve',
              ),
              h(
                'button',
                {
                  class: 'nexus-tool-run__btn',
                  attrs: { type: 'button' },
                  on: { click: () => this.$emit('revert', run) },
                },
                'Revert',
              ),
            ])
          : null,
        this.canViewToolDetails && this.expanded
          ? h('div', { class: 'nexus-tool-run__details' }, [
              Object.keys(run.args || {}).length
                ? h('div', { class: 'nexus-tool-run__block' }, [
                    h('div', { class: 'nexus-tool-run__kicker' }, 'Input'),
                    h(
                      'pre',
                      { class: 'nexus-tool-run__pre' },
                      JSON.stringify(run.args, null, 2),
                    ),
                  ])
                : null,
              run.error
                ? h('p', { class: 'nexus-tool-run__error' }, String(run.error))
                : null,
              run.result != null
                ? h('div', { class: 'nexus-tool-run__block' }, [
                    h('div', { class: 'nexus-tool-run__kicker' }, 'Output'),
                    h(
                      'pre',
                      { class: 'nexus-tool-run__pre' },
                      JSON.stringify(run.result, null, 2),
                    ),
                  ])
                : null,
            ])
          : null,
      ],
    );
  },
};

export default DefaultToolRunWidget;
