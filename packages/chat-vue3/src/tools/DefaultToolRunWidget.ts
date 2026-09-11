import { h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

import type { ChatToolRun } from '@nexus/chat-core';
import { toolStatusClass, toolStatusLabel, truncateLabel } from './shared';

/**
 * Compact expandable tool run row with approve/revert actions.
 */
export const DefaultToolRunWidget = {
  name: 'NexusDefaultToolRunWidget',
  props: {
    run: { type: Object, required: true },
    canViewToolDetails: { type: Boolean, default: true },
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
    title(): string {
      const run = this.run as ChatToolRun;
      return truncateLabel(run.label || run.tool || 'tool', 64);
    },
    statusText(): string {
      return toolStatusLabel((this.run as ChatToolRun).status);
    },
  },
  render() {
    const run = this.run as ChatToolRun;
    return h(
      'div',
      {
        class: [
          'nexus-tool-run',
          toolStatusClass(run.status),
          this.expanded ? 'nexus-tool-run--open' : '',
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
              title: run.tool || run.label || undefined,
            },
            on: {
              click: () => {
                if (this.canViewToolDetails) this.expanded = !this.expanded;
              },
            },
          },
          [
            h('span', {
              class: ['nexus-tool-run__dot', toolStatusClass(run.status)],
              attrs: { 'aria-hidden': 'true' },
            }),
            h('span', { class: 'nexus-tool-run__title' }, this.title),
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
