import { defineComponent } from 'vue';
import type { UserChoiceOption, UserChoiceQuestion } from '@nexus/chat-core';

/**
 * ask_user_choice — renders the agent's question card.
 *
 * Two paths, both supported:
 * - Typed: pass a `question` (UserChoiceQuestion); the widget emits
 *   `answer` with `{ questionId, selectedIds, customText }`, which the host
 *   submits as a structured `questionAnswer`.
 * - Legacy: pass `options`; the widget emits `choice-select` with the label
 *   (sent as an ordinary user message). Kept for hosts not yet migrated.
 */
export const AskUserChoiceToolWidget = defineComponent({
  name: 'NexusAskUserChoiceToolWidget',
  props: {
    question: { type: Object, default: null },
    options: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
  },
  data() {
    return { customText: '', selectedIds: [] as string[], remember: true, scope: 'user' as string, why: '' };
  },
  computed: {
    typed(): UserChoiceQuestion | null {
      return (this.question as UserChoiceQuestion | null) || null;
    },
    rememberDecision(): boolean {
      return this.typed?.rememberDecision === true;
    },
    persistArg(): { enabled: boolean; scope: string; why: string | null } | null {
      if (!this.rememberDecision) return null;
      return { enabled: this.remember, scope: this.scope, why: String(this.why || '').trim() || null };
    },
    resolvedOptions(): UserChoiceOption[] {
      const q = this.typed;
      return q ? (q.options as UserChoiceOption[]) : ((this.options || []) as UserChoiceOption[]);
    },
    multiSelect(): boolean {
      return this.typed?.multiSelect === true;
    },
    title(): string {
      const q = this.typed;
      if (q?.question) return q.question;
      return this.active ? 'Your answer needed' : 'Quick response';
    },
    actionable(): boolean {
      return this.selectedIds.length > 0 || String(this.customText || '').trim().length > 0;
    },
  },
  methods: {
    toggle(opt: UserChoiceOption) {
      if (this.disabled) return;
      const id = opt.id || opt.label;
      if (this.multiSelect) {
        this.selectedIds = this.selectedIds.includes(id)
          ? this.selectedIds.filter((x) => x !== id)
          : [...this.selectedIds, id];
        return;
      }
      this.selectedIds = this.selectedIds.includes(id) ? [] : [id];
    },
    select(opt: UserChoiceOption) {
      if (this.disabled) return;
      // Legacy path: no typed question → emit the label as a plain message.
      if (!this.typed) {
        this.$emit('choice-select', opt.label);
        return;
      }
      this.toggle(opt);
    },
    submit(e?: Event) {
      e?.preventDefault();
      if (this.disabled) return;
      const text = String(this.customText || '').trim();
      if (this.typed) {
        if (!this.actionable) return;
        this.$emit('answer', {
          questionId: this.typed.questionId,
          selectedIds: this.selectedIds,
          customText: text || null,
          ...(this.persistArg ? { persist: this.persistArg } : {}),
        });
        this.customText = '';
        return;
      }
      if (!text) return;
      this.$emit('choice-select', text);
      this.customText = '';
    },
  },
  render(h: any) {
    const options = this.resolvedOptions;
    return h(
      'div',
      {
        class: [
          'nexus-ask-choice',
          this.active ? 'nexus-ask-choice--active' : '',
        ],
      },
      [
        h('div', { class: 'nexus-ask-choice__title small font-weight-bold' }, this.title),
        options.length
          ? h(
              'div',
              { class: 'nexus-ask-choice__options' },
              options.map((opt) =>
                h(
                  'button',
                  {
                    key: opt.id || opt.label,
                    class: [
                      'btn btn-sm btn-block text-left mb-1',
                      this.typed && this.selectedIds.includes(opt.id || opt.label)
                        ? 'btn-primary'
                        : 'btn-outline-primary',
                    ],
                    attrs: { type: 'button', disabled: this.disabled },
                    on: { click: () => this.select(opt) },
                  },
                  opt.recommended ? `${opt.label} (recommended)` : opt.label,
                ),
              ),
            )
          : null,
        this.rememberDecision
          ? h('div', { class: 'nexus-ask-choice__persist mt-1' }, [
              h('div', { class: 'form-check' }, [
                h('input', {
                  class: 'form-check-input',
                  attrs: { type: 'checkbox', id: `remember-${this.typed?.questionId ?? ''}`, disabled: this.disabled },
                  domProps: { checked: this.remember },
                  on: { change: (e: Event) => { this.remember = (e.target as HTMLInputElement).checked; } },
                }),
                h('label', { class: 'form-check-label small', attrs: { for: `remember-${this.typed?.questionId ?? ''}` } }, 'Remember this decision'),
              ]),
              this.remember
                ? h('div', { class: 'nexus-ask-choice__persist-details mt-1' }, [
                    h('select', {
                      class: 'form-control form-control-sm mt-1',
                      attrs: { disabled: this.disabled, 'aria-label': 'Store it for' },
                      domProps: { value: this.scope },
                      on: { change: (e: Event) => { this.scope = (e.target as HTMLSelectElement).value; } },
                    }, [
                      h('option', { attrs: { value: 'user' } }, 'Just me'),
                      h('option', { attrs: { value: 'org' } }, 'My organization'),
                      h('option', { attrs: { value: 'agent' } }, 'This agent'),
                    ]),
                    h('input', {
                      class: 'form-control form-control-sm mt-1',
                      attrs: { type: 'text', placeholder: 'Why? (optional)', disabled: this.disabled, 'aria-label': 'Why remember' },
                      domProps: { value: this.why },
                      on: { input: (e: Event) => { this.why = (e.target as HTMLInputElement).value; } },
                    }),
                  ])
                : null,
            ])
          : null,
        h(
          'form',
          {
            class: 'nexus-ask-choice__custom d-flex mt-1',
            on: { submit: this.submit },
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
                  disabled: this.disabled || (this.typed ? !this.actionable : !String(this.customText || '').trim()),
                },
              },
              'Send',
            ),
          ],
        ),
      ],
    );
  },
});

export default AskUserChoiceToolWidget;
