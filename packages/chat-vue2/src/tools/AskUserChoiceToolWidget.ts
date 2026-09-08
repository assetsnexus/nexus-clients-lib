import type { UserChoiceOption } from '@nexus/chat-core';

/**
 * ask_user_choice — emits choice-select with the option label (sent as user message).
 */
export const AskUserChoiceToolWidget = {
  name: 'NexusAskUserChoiceToolWidget',
  props: {
    options: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
  },
  data() {
    return { customText: '' };
  },
  methods: {
    select(opt: UserChoiceOption) {
      if (this.disabled) return;
      this.$emit('choice-select', opt.label);
    },
    submitCustom(e: Event) {
      e.preventDefault();
      const text = String(this.customText || '').trim();
      if (!text || this.disabled) return;
      this.$emit('choice-select', text);
      this.customText = '';
    },
  },
  render(h: any) {
    const options = (this.options || []) as UserChoiceOption[];
    return h(
      'div',
      {
        class: [
          'nexus-ask-choice',
          this.active ? 'nexus-ask-choice--active' : '',
        ],
      },
      [
        h('div', { class: 'nexus-ask-choice__title small font-weight-bold' }, [
          this.active ? 'Your answer needed' : 'Quick response',
        ]),
        options.length
          ? h(
              'div',
              { class: 'nexus-ask-choice__options' },
              options.map((opt) =>
                h(
                  'button',
                  {
                    key: opt.id,
                    class: 'btn btn-outline-primary btn-sm btn-block text-left mb-1',
                    attrs: { type: 'button', disabled: this.disabled },
                    on: { click: () => this.select(opt) },
                  },
                  opt.label,
                ),
              ),
            )
          : null,
        h(
          'form',
          {
            class: 'nexus-ask-choice__custom d-flex mt-1',
            on: { submit: this.submitCustom },
          },
          [
            h('input', {
              class: 'form-control form-control-sm mr-1',
              attrs: {
                type: 'text',
                placeholder: 'Or type your own answer…',
                disabled: this.disabled,
                'aria-label': 'Type your own answer',
              },
              domProps: { value: this.customText },
              on: {
                input: (e: Event) => {
                  this.customText = (e.target as HTMLInputElement).value;
                },
              },
            }),
            h(
              'button',
              {
                class: 'btn btn-sm btn-primary',
                attrs: {
                  type: 'submit',
                  disabled: this.disabled || !String(this.customText || '').trim(),
                },
              },
              'Send',
            ),
          ],
        ),
      ],
    );
  },
};

export default AskUserChoiceToolWidget;
