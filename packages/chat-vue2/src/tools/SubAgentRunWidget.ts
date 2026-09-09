import type { ChatToolRun, SubAgentFinalStatus } from '@nexus/chat-core';

type SubEvent = { type: string; data?: Record<string, unknown> };

const STATUS_CHIP: Record<SubAgentFinalStatus, { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'badge-success' },
  error: { label: 'Error', cls: 'badge-danger' },
  timeout: { label: 'Timeout', cls: 'badge-warning' },
  cancelled: { label: 'Cancelled', cls: 'badge-secondary' },
  interrupted: { label: 'Interrupted', cls: 'badge-info' },
};

function progressRingAttrs(pct: number) {
  const r = 12;
  const c = 2 * Math.PI * r;
  return { r, c, offset: c - (pct / 100) * c };
}

/**
 * WP23: Nested sub-agent run card with collapsible timeline, progress ring,
 * streamed answer, structured summary, status chips, accessibility.
 */
export const SubAgentRunWidget = {
  name: 'NexusSubAgentRunWidget',
  props: {
    mission: { type: String, default: '' },
    events: { type: Array, default: () => [] },
    status: { type: String, default: 'running' },
    parentCallId: { type: String, default: '' },
    canViewToolDetails: { type: Boolean, default: false },
    run: { type: Object, default: null },
  },
  data() {
    return { open: true, showSummaryJson: false };
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
    typedRun(): ChatToolRun | null {
      return (this.run as ChatToolRun) || null;
    },
    subAgentText(): string {
      return this.typedRun?.subAgentText || '';
    },
    tokensUsed(): number {
      return this.typedRun?.subAgentTokensUsed || 0;
    },
    currentTool(): string {
      return this.typedRun?.subAgentCurrentTool || '';
    },
    finalStatus(): SubAgentFinalStatus | null {
      return (this.typedRun?.subAgentFinalStatus as SubAgentFinalStatus) || null;
    },
    summary(): unknown {
      return this.typedRun?.subAgentSummary || null;
    },
    isRunning(): boolean {
      return this.status === 'running';
    },
    isDone(): boolean {
      return !this.isRunning && this.finalStatus != null;
    },
    chipInfo(): { label: string; cls: string } | null {
      if (!this.finalStatus) return null;
      return STATUS_CHIP[this.finalStatus] || { label: this.finalStatus, cls: 'badge-secondary' };
    },
  },
  watch: {
    isDone(val: boolean) {
      if (val && this.finalStatus === 'completed') {
        this.open = false;
      }
    },
  },
  render(h: any) {
    const ring = this.isRunning ? progressRingAttrs(0) : null;

    const header = h(
      'button',
      {
        class: 'btn btn-link btn-sm btn-block text-left p-1 nexus-sub-agent__header',
        attrs: {
          type: 'button',
          'aria-expanded': String(this.open),
          'aria-label': `Sub-agent: ${this.mission || 'run'}`,
        },
        on: { click: () => (this.open = !this.open) },
      },
      [
        ring
          ? h(
              'svg',
              {
                class: 'nexus-sub-agent__ring mr-1',
                attrs: {
                  width: '20',
                  height: '20',
                  viewBox: '0 0 28 28',
                  'aria-hidden': 'true',
                },
              },
              [
                h('circle', {
                  attrs: {
                    cx: 14,
                    cy: 14,
                    r: ring.r,
                    fill: 'none',
                    stroke: '#e0e0e0',
                    'stroke-width': 2.5,
                  },
                }),
                h('circle', {
                  class: 'nexus-sub-agent__ring-fill',
                  attrs: {
                    cx: 14,
                    cy: 14,
                    r: ring.r,
                    fill: 'none',
                    stroke: '#51cbce',
                    'stroke-width': 2.5,
                    'stroke-dasharray': ring.c,
                    'stroke-dashoffset': ring.offset,
                    'stroke-linecap': 'round',
                  },
                }),
              ],
            )
          : null,
        h('span', { class: 'font-weight-bold' }, this.mission || 'Sub-agent'),
        this.isRunning
          ? h('span', { class: 'text-muted small ml-1', attrs: { 'aria-live': 'polite' } }, 'running…')
          : this.chipInfo
            ? h('span', { class: `badge ${this.chipInfo.cls} ml-1` }, this.chipInfo.label)
            : null,
        this.tokensUsed
          ? h('span', { class: 'text-muted small ml-2' }, `${this.tokensUsed} tok`)
          : null,
        this.currentTool && this.isRunning
          ? h('span', { class: 'text-muted small ml-2 font-monospace' }, this.currentTool)
          : null,
        h('span', { class: 'float-right' }, this.open ? '▾' : '▸'),
      ],
    );

    const body = this.open
      ? h('div', { class: 'nexus-sub-agent__body px-1', attrs: { role: 'region', 'aria-label': 'Sub-agent tools' } }, [
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
          this.subAgentText
            ? h(
                'div',
                { class: 'nexus-sub-agent__answer small text-muted mt-1 p-1', attrs: { 'aria-live': 'polite' } },
                this.subAgentText.slice(0, 3000),
              )
            : null,
          this.canViewToolDetails && this.summary
            ? h('div', { class: 'mt-1' }, [
                h(
                  'button',
                  {
                    class: 'btn btn-link btn-sm p-0 small',
                    attrs: { type: 'button' },
                    on: { click: () => (this.showSummaryJson = !this.showSummaryJson) },
                  },
                  this.showSummaryJson ? 'Hide details' : 'Show details',
                ),
                this.showSummaryJson
                  ? h(
                      'pre',
                      { class: 'nexus-tool-run__pre small mt-1' },
                      JSON.stringify(this.summary, null, 2).slice(0, 2000),
                    )
                  : null,
              ])
            : null,
        ])
      : null;

    return h(
      'div',
      {
        class: [
          'nexus-sub-agent',
          this.isRunning ? 'nexus-sub-agent--running' : '',
          this.finalStatus === 'error' ? 'nexus-sub-agent--error' : '',
        ],
        attrs: { 'aria-live': 'polite' },
      },
      [header, body],
    );
  },
};

export default SubAgentRunWidget;
