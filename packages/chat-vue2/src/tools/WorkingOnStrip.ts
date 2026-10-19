import { defineComponent } from 'vue';
import {
  buildWorkingOnSummary,
  type WorkingOnLedgerInput,
  type WorkingOnRunInput,
} from '@nexus/chat-core';

/**
 * Plan Part C9 — portal "working on" strip (active AgentRuns + open ledger items).
 *
 * Framework-portable: the derivation lives in `@nexus/chat-core`
 * (`buildWorkingOnSummary`) so the portal and the app agree on the shape.
 * Purely presentational; it never starts or approves anything.
 */
export const WorkingOnStrip = defineComponent({
  name: 'NexusWorkingOnStrip',
  props: {
    runs: { type: Array, default: () => [] },
    ledger: { type: Array, default: () => [] },
    compact: { type: Boolean, default: true },
  },
  computed: {
    summary(): ReturnType<typeof buildWorkingOnSummary> {
      return buildWorkingOnSummary({
        runs: (this.runs || []) as WorkingOnRunInput[],
        ledger: (this.ledger || []) as WorkingOnLedgerInput[],
      });
    },
  },
  methods: {
    onSelect(item: { id: string; kind: 'run' | 'ledger' }) {
      this.$emit('select', item);
    },
  },
  render(h: any) {
    const vm = this as unknown as {
      summary: ReturnType<typeof buildWorkingOnSummary>;
      compact: boolean;
      onSelect: (item: { id: string; kind: 'run' | 'ledger' }) => void;
    };
    const summary = vm.summary;
    if (!summary.items.length) {
      return h('div', { attrs: { hidden: true }, 'data-nexus-surface': 'working-on' });
    }
    return h(
      'div',
      {
        class: ['nexus-working-on', vm.compact ? 'nexus-working-on--compact' : ''],
        attrs: { 'data-nexus-surface': 'working-on', role: 'region', 'aria-label': 'Working on', 'aria-live': 'polite' },
      },
      [
        h('span', { class: 'nexus-working-on__headline' }, summary.headline),
        ...summary.items.map((item) =>
          h(
            'button',
            {
              key: `${item.kind}:${item.id}`,
              class: ['nexus-working-on__chip', item.needsUser ? 'nexus-working-on__chip--warn' : ''],
              attrs: { type: 'button', title: item.status },
              on: { click: () => vm.onSelect({ id: item.id, kind: item.kind }) },
            },
            `${item.kind === 'run' ? '⏳ ' : '• '}${item.label}`,
          ),
        ),
      ],
    );
  },
});

export default WorkingOnStrip;
