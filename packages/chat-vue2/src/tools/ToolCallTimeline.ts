import {
  isScheduleCheckBackTool,
  parseScheduleCheckBackResult,
  parseUserChoiceOptions,
  type ChatToolRun,
} from '@nexus/chat-core';
import AskUserChoiceToolWidget from './AskUserChoiceToolWidget';
import DefaultToolRunWidget from './DefaultToolRunWidget';
import MediaToolWidget from './MediaToolWidget';
import ModeRefusalChipWidget from './ModeRefusalChipWidget';
import ScheduleCheckBackToolWidget from './ScheduleCheckBackToolWidget';
import StorageFileToolWidget from './StorageFileToolWidget';
import SubAgentRunWidget from './SubAgentRunWidget';
import {
  normalizeToolRun,
  resolveSubAgentWidgetStatus,
  resolveToolAccessKind,
  toolStatusClass,
} from './shared';

type StreamEv = { type: string; data?: Record<string, unknown> };

const COMPACT_VISIBLE = 3;

function subAgentEventsForCall(
  toolEvents: StreamEv[] | undefined,
  parentCallId: string,
  subAgentRunId?: string | null,
): StreamEv[] {
  if (!toolEvents) return [];
  return toolEvents
    .filter((e) => e.type.startsWith('sub_agent_'))
    .filter((e) => {
      const d = (e.data || {}) as Record<string, unknown>;
      if (d.parentCallId === parentCallId) return true;
      if (!subAgentRunId) return false;
      return d.subAgentRunId === subAgentRunId || d.runId === subAgentRunId;
    });
}

function isErrorStatus(status: string | undefined): boolean {
  return status === 'error' || status === 'reverted';
}

function formatToolsSummary(total: number, errors: number): string {
  const tools = total === 1 ? '1 tool called' : `${total} tools called`;
  if (errors <= 0) return tools;
  return `${tools} · ${errors === 1 ? '1 error' : `${errors} errors`}`;
}

/**
 * Specialized tool timeline — routes to media / choice / check-back / storage / sub-agent / default.
 * While streaming, collapses to the current call + previous two (fading) unless expanded.
 * When finished, shows a compact summary (expandable to the full list) — never auto-expands.
 */
export const ToolCallTimeline = {
  name: 'NexusToolCallTimeline',
  components: {
    AskUserChoiceToolWidget,
    DefaultToolRunWidget,
    MediaToolWidget,
    ModeRefusalChipWidget,
    ScheduleCheckBackToolWidget,
    StorageFileToolWidget,
    SubAgentRunWidget,
  },
  props: {
    events: { type: Array, default: () => [] },
    toolEvents: { type: Array, default: () => [] },
    streaming: { type: Boolean, default: false },
    conversationId: { type: String, default: null },
    choiceActive: { type: Boolean, default: false },
    canViewToolDetails: { type: Boolean, default: true },
    pollWorkload: { type: Function, default: null },
    triggerCheckBack: { type: Function, default: null },
    /** P8-8: shared `useModeTransition` state, owned by the panel — drives the refusal chip's ring. */
    modeTransition: { type: Object, default: null },
  },
  data() {
    return { expandedAll: false };
  },
  watch: {
    streaming(next: boolean) {
      // Live compact on start; finished summary when the turn ends (never stay expanded).
      this.expandedAll = false;
      void next;
    },
  },
  computed: {
    normalized(): ChatToolRun[] {
      return (this.events || []).map((ev: any) => normalizeToolRun(ev));
    },
    errorCount(): number {
      return this.normalized.filter((r) => isErrorStatus(r.status)).length;
    },
    /** Live strip: last 3 with fade, unless the user expanded mid-stream. */
    useLiveCompact(): boolean {
      return !!this.streaming && !this.expandedAll && this.normalized.length > COMPACT_VISIBLE;
    },
    /** Finished turn: one summary row until the user expands. */
    useFinishedSummary(): boolean {
      return !this.streaming && !this.expandedAll && this.normalized.length > 0;
    },
    visibleRuns(): Array<{ run: ChatToolRun; fadeLevel: number }> {
      const all = this.normalized;
      if (this.useFinishedSummary) return [];
      if (!this.useLiveCompact) {
        return all.map((run) => ({ run, fadeLevel: 0 }));
      }
      const slice = all.slice(-COMPACT_VISIBLE);
      // Oldest of the three is most faded; newest (current) is full opacity.
      return slice.map((run, i) => ({
        run,
        fadeLevel: slice.length - 1 - i,
      }));
    },
    hiddenCount(): number {
      if (!this.useLiveCompact) return 0;
      return Math.max(0, this.normalized.length - COMPACT_VISIBLE);
    },
    summaryLabel(): string {
      return formatToolsSummary(this.normalized.length, this.errorCount);
    },
  },
  methods: {
    onChoice(label: string) {
      this.$emit('choice-select', label);
    },
    onApprove(run: ChatToolRun) {
      this.$emit('approve', run);
    },
    onRevert(run: ChatToolRun) {
      this.$emit('revert', run);
    },
    onResumeComplete() {
      this.$emit('check-back-resume');
    },
    onSwitchMode(payload: { required: string; mode: string; callId: string }) {
      this.$emit('switch-mode', payload);
    },
    renderRun(h: any, run: ChatToolRun, fadeLevel = 0) {
      // P8-8: a mode refusal is a terminal, distinct state — check status first,
      // ahead of every tool-name branch (including DefaultToolRunWidget), so a
      // blocked call never renders as "done" regardless of which tool it was.
      if (run.status === 'mode_blocked') {
        return h(ModeRefusalChipWidget, {
          key: run.id,
          props: { run, modeTransition: this.modeTransition },
          on: { 'switch-mode': this.onSwitchMode },
        });
      }
      if (isScheduleCheckBackTool(run.tool) && parseScheduleCheckBackResult(run.result)) {
        return h(ScheduleCheckBackToolWidget, {
          key: run.id,
          props: {
            run,
            conversationId: this.conversationId,
            triggerCheckBack: this.triggerCheckBack,
          },
          on: { 'resume-complete': this.onResumeComplete },
        });
      }
      if (run.tool === 'ask_user_choice') {
        const options = parseUserChoiceOptions(run);
        return h(AskUserChoiceToolWidget, {
          key: run.id,
          props: {
            options,
            disabled: this.streaming || run.status === 'running',
            active: this.choiceActive,
          },
          on: { 'choice-select': this.onChoice },
        });
      }
      if (run.tool === 'generate_image' || run.tool === 'generate_audio') {
        return h(MediaToolWidget, {
          key: run.id,
          props: { run, pollWorkload: this.pollWorkload },
        });
      }
      if (run.tool === 'present_file' || run.tool === 'present_files') {
        return h(StorageFileToolWidget, { key: run.id, props: { run } });
      }
      if (run.tool === 'run_sub_agent' || run.kind === 'sub_agent') {
        const subAgentRunId =
          run.subAgentRunId ||
          (typeof run.result === 'object' &&
          run.result &&
          typeof (run.result as { runId?: unknown }).runId === 'string'
            ? String((run.result as { runId: string }).runId)
            : null);
        const subEvents = subAgentEventsForCall(
          this.toolEvents as StreamEv[],
          run.id,
          subAgentRunId,
        );
        const mission =
          typeof run.args?.mission === 'string' ? run.args.mission : '';
        return h(SubAgentRunWidget, {
          key: run.id,
          props: {
            mission,
            events: subEvents,
            status: resolveSubAgentWidgetStatus(run, subEvents),
            parentCallId: run.id,
            canViewToolDetails: this.canViewToolDetails,
            run,
            plan: run.plan || null,
            tasks: run.tasks || [],
            linkedConversationId: run.linkedConversationId || null,
            subAgentRunId: run.subAgentRunId || null,
          },
          on: {
            pause: (p: unknown) => this.$emit('subagent-pause', p),
            cancel: (p: unknown) => this.$emit('subagent-cancel', p),
            open: (p: unknown) => this.$emit('subagent-open', p),
            'message-delivery': (p: unknown) => this.$emit('subagent-message', p),
            'task-toggle': (p: unknown) => this.$emit('subagent-task-toggle', p),
            'review-approval': (p: unknown) => this.$emit('subagent-review-approval', p),
          },
        });
      }
      return h(DefaultToolRunWidget, {
        key: run.id,
        props: { run, canViewToolDetails: this.canViewToolDetails, fadeLevel },
        on: { approve: this.onApprove, revert: this.onRevert },
      });
    },
  },
  render(h: any) {
    if (!this.normalized.length) return null;

    if (this.useFinishedSummary) {
      return h(
        'div',
        { class: ['anx-tool-call-timeline', 'nexus-tool-timeline', 'nexus-tool-timeline--summary'] },
        [
          h(
            'button',
            {
              class: [
                'nexus-tool-timeline__summary',
                this.errorCount > 0 ? 'nexus-tool-timeline__summary--errors' : '',
              ],
              attrs: {
                type: 'button',
                title: 'Show tool calls',
                'aria-expanded': 'false',
              },
              on: { click: () => { this.expandedAll = true; } },
            },
            [
              h('span', { class: 'nexus-tool-timeline__summary-label' }, this.summaryLabel),
              h('span', { class: 'nexus-tool-run__chev', attrs: { 'aria-hidden': 'true' } }, '▸'),
            ],
          ),
        ],
      );
    }

    const items = this.visibleRuns.map(({ run, fadeLevel }) => {
      const access = resolveToolAccessKind(run);
      return h(
        'div',
        {
          key: run.id || run.tool,
          class: [
            'timeline-item',
            fadeLevel === 1 ? 'timeline-item--fade-1' : '',
            fadeLevel === 2 ? 'timeline-item--fade-2' : '',
          ],
        },
        [
          h('div', {
            class: [
              'timeline-marker',
              toolStatusClass(run.status),
              access === 'write' ? 'is-write' : '',
              access === 'read' ? 'is-read' : '',
            ],
          }),
          h('div', { class: 'timeline-body' }, [this.renderRun(h, run, fadeLevel)]),
        ],
      );
    });

    const controls: unknown[] = [];
    if (this.useLiveCompact && this.hiddenCount > 0) {
      controls.push(
        h(
          'button',
          {
            class: 'nexus-tool-timeline__expand',
            attrs: { type: 'button' },
            on: { click: () => { this.expandedAll = true; } },
          },
          `Show all ${this.normalized.length} tools`,
        ),
      );
    } else if (this.streaming && this.expandedAll && this.normalized.length > COMPACT_VISIBLE) {
      controls.push(
        h(
          'button',
          {
            class: 'nexus-tool-timeline__expand',
            attrs: { type: 'button' },
            on: { click: () => { this.expandedAll = false; } },
          },
          'Show compact',
        ),
      );
    } else if (!this.streaming && this.expandedAll) {
      controls.unshift(
        h(
          'button',
          {
            class: 'nexus-tool-timeline__expand',
            attrs: { type: 'button', 'aria-expanded': 'true' },
            on: { click: () => { this.expandedAll = false; } },
          },
          this.summaryLabel,
        ),
      );
    }

    return h(
      'div',
      {
        class: [
          'anx-tool-call-timeline',
          'nexus-tool-timeline',
          this.useLiveCompact ? 'nexus-tool-timeline--compact' : '',
        ],
      },
      [...controls, ...items],
    );
  },
};

export default ToolCallTimeline;
