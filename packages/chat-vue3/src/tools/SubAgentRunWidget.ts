import { h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

type SubEvent = { type: string; data?: Record<string, unknown> };

/**
 * Nested sub-agent run timeline (run_sub_agent).
 */
export const SubAgentRunWidget = {
  name: 'NexusSubAgentRunWidget',
  props: {
    mission: { type: String, default: '' },
    events: { type: Array, default: () => [] },
    status: { type: String, default: 'running' },
    parentCallId: { type: String, default: '' },
    canViewToolDetails: { type: Boolean, default: false },
  },
  data() {
    return { open: true };
  },
  computed: {
    toolCalls(): SubEvent[] {
      return ((this.events || []) as SubEvent[]).filter((e) => e.type === 'sub_agent_tool_call');
    },
    toolResults(): SubEvent[] {
      return ((this.events || []) as SubEvent[]).filter((e) => e.type === 'sub_agent_tool_result');
    },
    tokens(): SubEvent[] {
      return ((this.events || []) as SubEvent[]).filter((e) => e.type === 'sub_agent_token');
    },
    final(): SubEvent | undefined {
      return ((this.events || []) as SubEvent[]).find((e) => e.type === 'sub_agent_done');
    },
  },
  render(_h: any) {
    return h('div', { class: 'nexus-sub-agent' }, [
      h(
        'button',
        {
          class: 'btn btn-link btn-sm btn-block text-left p-1',
          attrs: { type: 'button' },
          on: { click: () => (this.open = !this.open) },
        },
        [
          h('span', { class: 'font-weight-bold' }, 'Sub-agent'),
          this.status === 'running'
            ? h('span', { class: 'text-muted small ml-1' }, 'running…')
            : h('span', { class: 'badge badge-light ml-1' }, this.status),
          this.parentCallId
            ? h('span', { class: 'text-muted small ml-2 font-monospace' }, this.parentCallId)
            : null,
          h('span', { class: 'float-right' }, this.open ? '▾' : '▸'),
        ],
      ),
      this.mission
        ? h('p', { class: 'small text-muted mb-1 px-1' }, this.mission)
        : null,
      this.open
        ? h('div', { class: 'nexus-sub-agent__body px-1' }, [
            ...this.toolCalls.map((ev: SubEvent, i: number) =>
              h(
                'div',
                { key: `tc-${i}`, class: 'small font-monospace text-muted' },
                `→ ${String(ev.data?.name ?? '')}`,
              ),
            ),
            ...this.toolResults.map((ev: SubEvent, i: number) =>
              h(
                'div',
                {
                  key: `tr-${i}`,
                  class: [
                    'small font-monospace',
                    ev.data?.error ? 'text-danger' : 'text-success',
                  ],
                },
                `← ${String(ev.data?.name ?? 'tool')} ${ev.data?.error ? `(${ev.data.error})` : 'ok'}`,
              ),
            ),
            this.tokens.length
              ? h(
                  'p',
                  { class: 'small text-muted font-italic' },
                  `${this.tokens.length} token chunk(s) streamed`,
                )
              : null,
            this.canViewToolDetails && this.final
              ? h(
                  'pre',
                  { class: 'nexus-tool-run__pre small' },
                  JSON.stringify(
                    this.final.data?.result ?? this.final.data,
                    null,
                    2,
                  ).slice(0, 2000),
                )
              : null,
          ])
        : null,
    ]);
  },
};

export default SubAgentRunWidget;
