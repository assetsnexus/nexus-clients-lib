import type { SubAgentStripItem } from '@nexus/chat-core';
import { toolStatusClass, toolStatusLabel, truncateLabel } from './shared';

/**
 * Compact strip: count badge + expandable active subagent list.
 */
export const SubAgentsStrip = {
  name: 'NexusSubAgentsStrip',
  props: {
    runs: { type: Array, default: () => [] },
    compact: { type: Boolean, default: true },
    canControl: { type: Boolean, default: true },
  },
  data() {
    return { expanded: false };
  },
  computed: {
    items(): SubAgentStripItem[] {
      return (this.runs || []) as SubAgentStripItem[];
    },
    activeCount(): number {
      return this.items.filter((r) => this.isActive(r)).length;
    },
    totalCount(): number {
      return this.items.length;
    },
  },
  methods: {
    emitOpen(run: SubAgentStripItem) {
      this.$emit('open-run', {
        runId: run.runId,
        linkedConversationId: run.linkedConversationId || null,
        parentCallId: run.parentCallId,
      });
    },
    emitPause(run: SubAgentStripItem) {
      this.$emit('pause-run', { runId: run.runId || run.parentCallId });
    },
    emitCancel(run: SubAgentStripItem) {
      this.$emit('cancel-run', { runId: run.runId || run.parentCallId });
    },
    isActive(run: SubAgentStripItem): boolean {
      const s = String(run.status || '').toLowerCase();
      return s === 'running' || s === 'paused' || s === 'queued' || s === 'pending';
    },
  },
  render(h: any) {
    if (!this.items.length) return null;

    const header = h(
      'button',
      {
        class: 'nexus-subagents-strip__toggle',
        attrs: {
          type: 'button',
          'aria-expanded': String(this.expanded),
          'aria-label': `${this.totalCount} subagents`,
        },
        on: {
          click: () => {
            this.expanded = !this.expanded;
            this.$emit('toggle-expand', this.expanded);
          },
        },
      },
      [
        h('span', { class: 'nexus-subagents-strip__title' }, 'Subagents'),
        h(
          'span',
          {
            class: [
              'nexus-subagents-strip__badge',
              this.activeCount ? 'nexus-subagents-strip__badge--live' : '',
            ],
          },
          String(this.totalCount),
        ),
        this.activeCount
          ? h(
              'span',
              { class: 'nexus-subagents-strip__live' },
              `${this.activeCount} live`,
            )
          : null,
        h(
          'span',
          { class: 'nexus-subagents-strip__chev', attrs: { 'aria-hidden': 'true' } },
          this.expanded ? '▾' : '▸',
        ),
      ],
    );

    const list = this.expanded
      ? h(
          'ul',
          { class: 'nexus-subagents-strip__list', attrs: { role: 'list' } },
          this.items.map((run: SubAgentStripItem) =>
            h('li', { key: run.id, class: 'nexus-subagents-strip__item' }, [
              h('span', {
                class: ['nexus-tool-run__dot', toolStatusClass(String(run.status || ''))],
                attrs: { 'aria-hidden': 'true' },
              }),
              h(
                'span',
                { class: 'nexus-subagents-strip__mission', attrs: { title: run.mission } },
                truncateLabel(run.mission || 'Subagent', 56),
              ),
              h(
                'span',
                { class: ['nexus-tool-run__chip', toolStatusClass(String(run.status || ''))] },
                toolStatusLabel(String(run.status || '')),
              ),
              this.canControl
                ? h('span', { class: 'nexus-subagents-strip__actions' }, [
                    run.linkedConversationId || run.runId
                      ? h(
                          'button',
                          {
                            class: 'nexus-tool-run__btn nexus-tool-run__btn--ghost',
                            attrs: { type: 'button' },
                            on: { click: () => this.emitOpen(run) },
                          },
                          'View chat',
                        )
                      : null,
                    this.isActive(run)
                      ? h(
                          'button',
                          {
                            class: 'nexus-tool-run__btn nexus-tool-run__btn--ghost',
                            attrs: { type: 'button' },
                            on: { click: () => this.emitPause(run) },
                          },
                          'Pause',
                        )
                      : null,
                    this.isActive(run)
                      ? h(
                          'button',
                          {
                            class: 'nexus-tool-run__btn nexus-tool-run__btn--danger',
                            attrs: { type: 'button' },
                            on: { click: () => this.emitCancel(run) },
                          },
                          'Cancel',
                        )
                      : null,
                  ])
                : null,
            ]),
          ),
        )
      : null;

    return h(
      'div',
      {
        class: [
          'nexus-subagents-strip',
          this.compact ? 'nexus-subagents-strip--compact' : '',
          this.activeCount ? 'nexus-subagents-strip--active' : '',
          this.expanded ? 'nexus-subagents-strip--open' : '',
        ],
        attrs: { 'aria-live': 'polite' },
      },
      [header, list],
    );
  },
};

export default SubAgentsStrip;
