import { defineComponent } from 'vue';
import {
  buildPermissionSummary,
  permissionSummaryIsEmpty,
  type PermissionSummaryInput,
  type PermissionSummarySection,
} from '@nexus/chat-core';
/**
 * Plan Part C5 — portal permission summary card (read-only).
 *
 * Renders what the agent is allowed to do from capability / tool-pack /
 * outbound-audience data the backend already exposes. Outbound audiences are
 * masked. It grants nothing and approves nothing.
 */
export const PermissionSummaryCard = defineComponent({
  name: 'NexusPermissionSummaryCard',
  props: {
    capabilities: { type: Array, default: () => [] },
    toolPacks: { type: Array, default: () => [] },
    outboundAudiences: { type: Array, default: () => [] },
    outboundChannels: { type: Array, default: () => [] },
    toolApprovalMode: { type: String, default: null },
    defaultOpen: { type: Boolean, default: false },
  },
  data() {
    return { open: this.defaultOpen };
  },
  computed: {
    summary(): ReturnType<typeof buildPermissionSummary> {
      return buildPermissionSummary({
        capabilities: this.capabilities,
        toolPacks: this.toolPacks,
        outboundAudiences: this.outboundAudiences,
        outboundChannels: this.outboundChannels,
        toolApprovalMode: this.toolApprovalMode,
      } as PermissionSummaryInput);
    },
    isEmpty(): boolean {
      return permissionSummaryIsEmpty(this.summary);
    },
  },
  render(h: any) {
    const summary = this.summary;
    const header = h(
      'button',
      {
        class: 'nexus-permissions__toggle',
        attrs: { type: 'button', 'aria-expanded': String(this.open) },
        on: { click: () => { this.open = !this.open; } },
      },
      [
        h('span', { class: 'nexus-permissions__title' }, 'Permissions'),
        h('span', { class: 'nexus-permissions__headline' }, summary.headline),
        h('span', { class: 'nexus-permissions__chev', attrs: { 'aria-hidden': 'true' } }, this.open ? '▾' : '▸'),
      ],
    );

    if (!this.open) {
      return h(
        'div',
        { class: 'nexus-permissions', attrs: { 'data-nexus-surface': 'permissions' } },
        [header],
      );
    }

    const body = this.isEmpty
      ? h('p', { class: 'nexus-permissions__empty' }, 'No capabilities attached yet.')
      : h(
          'div',
          { class: 'nexus-permissions__sections' },
          summary.sections.map((section: PermissionSummarySection) =>
            h('section', { key: section.key, class: 'nexus-permissions__section' }, [
              h('h4', { class: 'nexus-permissions__section-title' }, section.label),
              h(
                'ul',
                { class: 'nexus-permissions__list', attrs: { role: 'list' } },
                section.items.map((item: string, i: number) =>
                  h('li', { key: i, class: ['nexus-permissions__item', section.masked ? 'nexus-permissions__item--masked' : ''] }, item),
                ),
              ),
            ]),
          ),
        );

    return h(
      'div',
      { class: 'nexus-permissions nexus-permissions--open', attrs: { 'data-nexus-surface': 'permissions' } },
      [
        header,
        body,
        h('p', { class: 'nexus-permissions__approval' }, `Approval policy: ${summary.approvalMode}`),
      ],
    );
  },
});

export default PermissionSummaryCard;
