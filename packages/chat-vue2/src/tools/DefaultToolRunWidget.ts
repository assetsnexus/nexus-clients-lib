import type { ChatToolRun } from '@nexus/chat-core';
import { toolStatusClass } from './shared';

/**
 * Default expandable tool run with approve/revert actions.
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
  },
  render(h: any) {
    const run = this.run as ChatToolRun;
    return h('div', { class: 'nexus-tool-run' }, [
      h(
        'button',
        {
          class: 'nexus-tool-run__header btn btn-link btn-sm btn-block text-left p-1',
          attrs: {
            type: 'button',
            disabled: !this.canViewToolDetails,
          },
          on: {
            click: () => {
              if (this.canViewToolDetails) this.expanded = !this.expanded;
            },
          },
        },
        [
          h('span', { class: 'font-weight-bold' }, run.label || run.tool),
          h(
            'span',
            {
              class: [
                'nexus-tool-run__badge small ml-2',
                toolStatusClass(run.status),
              ],
            },
            run.status === 'running' ? 'running…' : run.status === 'success' ? 'done' : run.status,
          ),
          h('span', { class: 'text-muted small ml-2 font-monospace' }, run.tool),
          this.canViewToolDetails
            ? h('span', { class: 'float-right text-muted' }, this.expanded ? '▾' : '▸')
            : null,
        ],
      ),
      this.showApproval
        ? h('div', { class: 'mt-1' }, [
            h(
              'button',
              {
                class: 'btn btn-xs btn-success mr-1',
                attrs: { type: 'button' },
                on: { click: () => this.$emit('approve', run) },
              },
              'Approve',
            ),
            h(
              'button',
              {
                class: 'btn btn-xs btn-outline-secondary',
                attrs: { type: 'button' },
                on: { click: () => this.$emit('revert', run) },
              },
              'Revert',
            ),
          ])
        : null,
      this.canViewToolDetails && this.expanded
        ? h('div', { class: 'nexus-tool-run__details mt-1' }, [
            Object.keys(run.args || {}).length
              ? h('div', { class: 'mb-1' }, [
                  h('div', { class: 'text-muted small text-uppercase' }, 'Input'),
                  h(
                    'pre',
                    { class: 'nexus-tool-run__pre small mb-0' },
                    JSON.stringify(run.args, null, 2),
                  ),
                ])
              : null,
            run.error
              ? h('p', { class: 'text-danger small' }, String(run.error))
              : null,
            run.result != null
              ? h('div', [
                  h('div', { class: 'text-muted small text-uppercase' }, 'Output'),
                  h(
                    'pre',
                    { class: 'nexus-tool-run__pre small mb-0' },
                    JSON.stringify(run.result, null, 2),
                  ),
                ])
              : null,
          ])
        : null,
    ]);
  },
};

export default DefaultToolRunWidget;
