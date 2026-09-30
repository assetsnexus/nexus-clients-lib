import { defineComponent, h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

import type { MessageDelivery } from '@nexus/chat-core';

const OPTIONS: Array<{ value: MessageDelivery; label: string; hint: string }> = [
  { value: 'queue', label: 'Queue', hint: 'Deliver after the current step' },
  { value: 'interrupt', label: 'Interrupt', hint: 'Stop current work and inject now' },
  { value: 'steer', label: 'Steer', hint: 'Soft guidance without hard interrupt' },
];

/**
 * Delivery mode picker for messaging a live AgentRun / linked subchat.
 */
export const DeliveryModePicker = defineComponent({
  name: 'NexusDeliveryModePicker',
  props: {
    value: { type: String, default: 'queue' },
    disabled: { type: Boolean, default: false },
    compact: { type: Boolean, default: true },
  },
  methods: {
    setValue(next: MessageDelivery) {
      this.$emit('input', next);
      this.$emit('update:value', next);
    },
  },
  render(_h: any) {
    return h(
      'div',
      {
        class: [
          'nexus-delivery-picker',
          this.compact ? 'nexus-delivery-picker--compact' : '',
        ],
        attrs: { role: 'group', 'aria-label': 'Message delivery mode' },
      },
      OPTIONS.map((opt) =>
        h(
          'button',
          {
            key: opt.value,
            class: [
              'btn btn-sm',
              this.value === opt.value ? 'btn-primary' : 'btn-outline-secondary',
              'mr-1',
            ],
            attrs: {
              type: 'button',
              disabled: this.disabled,
              title: opt.hint,
              'aria-pressed': String(this.value === opt.value),
            },
            on: { click: () => this.setValue(opt.value) },
          },
          opt.label,
        ),
      ),
    );
  },
});

export default DeliveryModePicker;
