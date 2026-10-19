import { defineComponent } from 'vue';
import { explainLastAction, type ExplainActionInput } from '@nexus/chat-core';

/**
 * Plan Part C8 — portal "explain last action" chip.
 *
 * Renders the "why" the backend supplies (activity / approval / tool data). It
 * never invents a reason: when the backend gives none, `explainLastAction`
 * says so plainly. Read-only — it approves nothing.
 */
export const ExplainActionChip = defineComponent({
  name: 'NexusExplainActionChip',
  props: {
    toolName: { type: String, default: null },
    reason: { type: String, default: null },
    args: { type: Object, default: null },
    resultSummary: { type: String, default: null },
    status: { type: String, default: null },
    approvalRequired: { type: Boolean, default: false },
    compact: { type: Boolean, default: true },
  },
  data() {
    return { open: false };
  },
  computed: {
    explain(): ReturnType<typeof explainLastAction> {
      return explainLastAction({
        toolName: this.toolName,
        reason: this.reason,
        args: this.args as Record<string, unknown> | null,
        resultSummary: this.resultSummary,
        status: this.status,
        approvalRequired: this.approvalRequired,
      } as ExplainActionInput);
    },
  },
  methods: {
    toggle() {
      this.open = !this.open;
    },
  },
  render(h: any) {
    const explain = this.explain;
    const head = h(
      'button',
      {
        class: ['nexus-explain-chip', explain.needsApproval ? 'nexus-explain-chip--approval' : ''],
        attrs: {
          type: 'button',
          title: explain.why,
          'aria-expanded': String(this.open),
          'aria-label': `Why: ${explain.why}`,
        },
        on: { click: () => this.toggle() },
      },
      [h('span', { class: 'nexus-explain-chip__icon', attrs: { 'aria-hidden': 'true' } }, '💡'), explain.why],
    );

    const list = this.open
      ? h(
          'ul',
          { class: 'nexus-explain-chip__reasons', attrs: { role: 'list' } },
          explain.reasons.map((r: string, i: number) => h('li', { key: i }, r)),
        )
      : null;

    const args = this.open && explain.argSummary
      ? h('p', { class: 'nexus-explain-chip__args' }, explain.argSummary)
      : null;

    return h(
      'div',
      {
        class: ['nexus-explain', this.compact ? 'nexus-explain--compact' : ''],
        attrs: { 'data-nexus-surface': 'explain-action' },
      },
      [head, list, args],
    );
  },
});

export default ExplainActionChip;
