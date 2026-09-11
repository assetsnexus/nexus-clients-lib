import { h as vueH } from 'vue';
import { createCompatH } from './hCompat';
const h = createCompatH(vueH);

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
import { normalizeToolRun, toolStatusClass } from './shared';

type StreamEv = { type: string; data?: Record<string, unknown> };

function subAgentEventsForCall(
  toolEvents: StreamEv[] | undefined,
  parentCallId: string,
): StreamEv[] {
  if (!toolEvents) return [];
  return toolEvents
    .filter((e) => e.type.startsWith('sub_agent_'))
    .filter((e) => {
      const d = (e.data || {}) as Record<string, unknown>;
      return d.parentCallId === parentCallId;
    });
}

function subAgentStatus(events: StreamEv[]): string {
  const done = events.find((e) => e.type === 'sub_agent_done');
  if (!done) return 'running';
  const st = String((done.data as Record<string, unknown>)?.status ?? 'completed');
  if (st === 'completed') return 'completed';
  if (st === 'timeout') return 'timeout';
  if (st === 'cancelled') return 'cancelled';
  return 'error';
}

/**
 * Specialized tool timeline — routes to media / choice / check-back / storage / sub-agent / default.
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
  computed: {
    normalized(): ChatToolRun[] {
      return (this.events || []).map((ev: any) => normalizeToolRun(ev));
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
    renderRun(_h: any, run: ChatToolRun) {
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
        const subEvents = subAgentEventsForCall(
          this.toolEvents as StreamEv[],
          run.id,
        );
        const mission =
          typeof run.args?.mission === 'string' ? run.args.mission : '';
        return h(SubAgentRunWidget, {
          key: run.id,
          props: {
            mission,
            events: subEvents,
            status: subEvents.length
              ? subAgentStatus(subEvents)
              : run.status === 'running' || run.status === 'paused'
                ? run.status
                : run.subAgentFinalStatus || (run.status === 'success' ? 'completed' : 'completed'),
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
          },
        });
      }
      return h(DefaultToolRunWidget, {
        key: run.id,
        props: { run, canViewToolDetails: this.canViewToolDetails },
        on: { approve: this.onApprove, revert: this.onRevert },
      });
    },
  },
  render(_h: any) {
    if (!this.normalized.length) return null;
    return h(
      'div',
      { class: 'anx-tool-call-timeline nexus-tool-timeline' },
      this.normalized.map((run: ChatToolRun) =>
        h('div', { key: run.id || run.tool, class: 'timeline-item' }, [
          h('div', {
            class: ['timeline-marker', toolStatusClass(run.status)],
          }),
          h('div', { class: 'timeline-body' }, [this.renderRun(h, run)]),
        ]),
      ),
    );
  },
};

export default ToolCallTimeline;
