import type {
  AgentRunPlan,
  AgentRunTask,
  ChatToolRun,
  MessageDelivery,
  SubAgentFinalStatus,
  SubAgentPendingApproval,
} from '@nexus/chat-core';
import { renderChatMarkdown, CHAT_MARKDOWN_ROOT_CLASS } from '../markdown';
import DeliveryModePicker from './DeliveryModePicker';
import {
  extractNestedSearchToolRow,
  isSearchPresetNestedTool,
  pairSubAgentToolEvents,
  parseToolArguments,
  summaryMarkdownText,
} from './search-preset-tool-ui';
import { displayAnxCommandName, formatElapsedMs, resolveToolAccessKind, toolStatusClass, toolStatusLabel, truncateLabel } from './shared';

type SubEvent = { type: string; data?: Record<string, unknown> };

type LiveToolRow = {
  callId: string;
  label: string;
  status: 'running' | 'success' | 'error';
  hint: string | null;
  accessKind: 'read' | 'write' | null;
};

const LIVE_TOOL_LIMIT = 6;
const LIVE_OUTPUT_CHARS = 480;

function textTail(text: string, maxChars = LIVE_OUTPUT_CHARS): string {
  const t = String(text || '');
  if (!t) return '';
  if (t.length <= maxChars) return t;
  const slice = t.slice(-maxChars);
  const nl = slice.indexOf('\n');
  // Prefer starting on a line boundary when the cut is near the start of the window.
  return (nl >= 0 && nl < 96 ? slice.slice(nl + 1) : slice).replace(/^\s+/, '');
}

function shortActivityLabel(name: string, args: Record<string, unknown>): string {
  const commandish = displayAnxCommandName({ tool: name, args } as ChatToolRun);
  if (commandish.startsWith('anx.')) {
    const parts = commandish.split('.');
    return parts.slice(-2).join('.') || commandish;
  }
  if (name.startsWith('anx_')) {
    const dotted = name.replace(/_/g, '.');
    const parts = dotted.split('.');
    return parts.slice(-2).join('.') || dotted;
  }
  return truncateLabel(name || 'tool', 28);
}

function hintFromArgs(args: Record<string, unknown>): string | null {
  for (const key of ['query', 'q', 'url', 'mission', 'task', 'prompt', 'command']) {
    const v = args[key];
    if (typeof v === 'string' && v.trim()) return truncateLabel(v.trim(), 48);
  }
  return null;
}

const APPROVAL_CHIP = { label: 'needs approval', cls: 'is-approval' };

const APPROVAL_KIND_LABEL: Record<string, string> = {
  permission_elevation: 'Permission needed',
  sca: 'Confirmation needed',
  data_access: 'Data access needed',
};

const STATUS_CHIP: Record<SubAgentFinalStatus, { label: string; cls: string }> = {
  completed: { label: 'done', cls: 'is-success' },
  error: { label: 'error', cls: 'is-error' },
  timeout: { label: 'timeout', cls: 'is-mode-blocked' },
  cancelled: { label: 'cancelled', cls: 'is-mode-blocked' },
  interrupted: { label: 'interrupted', cls: 'is-mode-blocked' },
  paused: { label: 'paused', cls: 'is-paused' },
};

function progressRingAttrs(pct: number) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return { r, c, offset: c - (pct / 100) * c };
}

/**
 * Nested sub-agent / AgentRun card: compact header, plan/tasks, controls, delivery.
 * Collapsed by default; header shows mission name + elapsed while running.
 */
export const SubAgentRunWidget = {
  name: 'NexusSubAgentRunWidget',
  components: { DeliveryModePicker },
  props: {
    mission: { type: String, default: '' },
    events: { type: Array, default: () => [] },
    status: { type: String, default: 'running' },
    parentCallId: { type: String, default: '' },
    canViewToolDetails: { type: Boolean, default: false },
    run: { type: Object, default: null },
    plan: { type: Object, default: null },
    tasks: { type: Array, default: () => [] },
    linkedConversationId: { type: String, default: null },
    subAgentRunId: { type: String, default: null },
    canPause: { type: Boolean, default: true },
    canCancel: { type: Boolean, default: true },
    canOpen: { type: Boolean, default: true },
    showPlanTasks: { type: Boolean, default: true },
    showMessageBox: { type: Boolean, default: true },
  },
  data() {
    return {
      open: false,
      showSummaryJson: false,
      delivery: 'queue' as MessageDelivery,
      messageText: '',
      nowMs: Date.now(),
      startedAtFallbackMs: Date.now(),
      _elapsedTimer: null as ReturnType<typeof setInterval> | null,
    };
  },
  computed: {
    toolCalls(): SubEvent[] {
      return ((this.events || []) as SubEvent[]).filter((e) => e.type === 'sub_agent_tool_call');
    },
    toolResults(): SubEvent[] {
      return ((this.events || []) as SubEvent[]).filter((e) => e.type === 'sub_agent_tool_result');
    },
    final(): SubEvent | undefined {
      return ((this.events || []) as SubEvent[]).find((e) => e.type === 'sub_agent_done');
    },
    typedRun(): ChatToolRun | null {
      return (this.run as ChatToolRun) || null;
    },
    resolvedRunId(): string | null {
      return (
        this.subAgentRunId ||
        this.typedRun?.subAgentRunId ||
        (typeof this.typedRun?.result === 'object' &&
        this.typedRun?.result &&
        typeof (this.typedRun.result as { runId?: unknown }).runId === 'string'
          ? String((this.typedRun.result as { runId: string }).runId)
          : null) ||
        null
      );
    },
    resolvedLinkedId(): string | null {
      const fromResult =
        typeof this.typedRun?.result === 'object' &&
        this.typedRun?.result &&
        typeof (this.typedRun.result as { linkedConversationId?: unknown }).linkedConversationId ===
          'string'
          ? String((this.typedRun.result as { linkedConversationId: string }).linkedConversationId)
          : null;
      return this.linkedConversationId || this.typedRun?.linkedConversationId || fromResult || null;
    },
    resolvedPlan(): AgentRunPlan | null {
      return (this.plan as AgentRunPlan) || this.typedRun?.plan || null;
    },
    resolvedTasks(): AgentRunTask[] {
      const fromProp = (this.tasks || []) as AgentRunTask[];
      if (fromProp.length) return fromProp;
      return (this.typedRun?.tasks || []) as AgentRunTask[];
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
      return this.status === 'running' || this.status === 'paused' || this.awaitingApproval;
    },
    awaitingApproval(): boolean {
      return this.status === 'awaiting_approval';
    },
    pendingApproval(): SubAgentPendingApproval | null {
      return this.awaitingApproval ? this.typedRun?.subAgentPendingApproval || null : null;
    },
    approvalTitle(): string {
      const kind = this.pendingApproval?.approvalKind || 'permission_elevation';
      return APPROVAL_KIND_LABEL[kind] || 'Approval needed';
    },
    approvalDetail(): string {
      const p = this.pendingApproval;
      if (!p) return 'The subagent is waiting for your approval to continue.';
      const target = p.command || p.pack || '';
      const reason = p.reason ? truncateLabel(p.reason, 140) : '';
      return [target, reason].filter(Boolean).join(' — ') || 'The subagent is waiting for your approval.';
    },
    isDone(): boolean {
      return !this.isRunning && this.finalStatus != null;
    },
    chipInfo(): { label: string; cls: string } {
      if (this.awaitingApproval) return APPROVAL_CHIP;
      if (this.status === 'paused') return STATUS_CHIP.paused;
      if (this.status === 'running') return { label: 'running', cls: 'is-running' };
      if (this.finalStatus && STATUS_CHIP[this.finalStatus]) return STATUS_CHIP[this.finalStatus];
      return {
        label: toolStatusLabel(String(this.status || this.finalStatus || '')),
        cls: toolStatusClass(String(this.status || this.finalStatus || '')),
      };
    },
    missionTitle(): string {
      return truncateLabel(this.mission || 'Subagent', 64);
    },
    canOpenChat(): boolean {
      return this.canOpen && Boolean(this.resolvedLinkedId || this.resolvedRunId);
    },
    startedAtMs(): number {
      const fromRun = this.typedRun?.startedAtMs;
      if (typeof fromRun === 'number' && Number.isFinite(fromRun) && fromRun > 0) {
        return fromRun;
      }
      return this.startedAtFallbackMs;
    },
    elapsedLabel(): string {
      if (!this.isRunning) return '';
      return formatElapsedMs(this.nowMs - this.startedAtMs);
    },
    /** Compact recent tool activity for the expanded live strip. */
    liveToolRows(): LiveToolRow[] {
      const paired = pairSubAgentToolEvents(this.toolCalls, this.toolResults);
      return paired.slice(-LIVE_TOOL_LIMIT).map(({ call, result }) => {
        const name = String(call.data?.name || 'tool');
        const args = parseToolArguments(call.data?.arguments);
        const err =
          result?.data?.error != null
            ? String(result.data.error)
            : result?.data?.result &&
                typeof result.data.result === 'object' &&
                (result.data.result as { error?: unknown }).error != null
              ? String((result.data.result as { error: unknown }).error)
              : null;
        const status: LiveToolRow['status'] = !result
          ? 'running'
          : err
            ? 'error'
            : 'success';
        let hint = hintFromArgs(args);
        if (isSearchPresetNestedTool(name)) {
          const searchRow = extractNestedSearchToolRow(
            name,
            call.data?.arguments,
            result?.data?.result,
            Boolean(result),
          );
          hint = searchRow.hint || searchRow.blockedReason || hint;
        }
        return {
          callId: String(call.data?.callId || name),
          label: shortActivityLabel(name, args),
          status,
          hint,
          accessKind: resolveToolAccessKind({ tool: name, args } as ChatToolRun),
        };
      });
    },
    liveOutputTail(): string {
      return textTail(this.subAgentText || '');
    },
    summaryText(): string {
      return summaryMarkdownText(this.summary);
    },
  },
  watch: {
    isRunning: {
      immediate: true,
      handler(val: boolean) {
        this.syncElapsedTimer(val);
      },
    },
  },
  mounted() {
    this.syncElapsedTimer(this.isRunning);
  },
  beforeDestroy() {
    this.clearElapsedTimer();
  },
  methods: {
    clearElapsedTimer() {
      if (this._elapsedTimer) {
        clearInterval(this._elapsedTimer);
        this._elapsedTimer = null;
      }
    },
    syncElapsedTimer(running: boolean) {
      this.clearElapsedTimer();
      if (!running) return;
      this.nowMs = Date.now();
      this._elapsedTimer = setInterval(() => {
        this.nowMs = Date.now();
      }, 1000);
    },
    emitReviewApproval(ev?: Event) {
      if (ev) {
        ev.stopPropagation?.();
        ev.preventDefault?.();
      }
      this.$emit('review-approval', {
        runId: this.resolvedRunId,
        linkedConversationId: this.resolvedLinkedId,
        parentCallId: this.parentCallId,
        pendingApproval: this.pendingApproval,
      });
    },
    emitPause() {
      this.$emit('pause', { runId: this.resolvedRunId || this.parentCallId });
    },
    emitCancel() {
      this.$emit('cancel', { runId: this.resolvedRunId || this.parentCallId });
    },
    emitOpen(ev?: Event) {
      if (ev) {
        ev.stopPropagation?.();
        ev.preventDefault?.();
      }
      this.$emit('open', {
        linkedConversationId: this.resolvedLinkedId,
        runId: this.resolvedRunId,
        parentCallId: this.parentCallId,
      });
    },
    emitMessage() {
      const text = String(this.messageText || '').trim();
      if (!text) return;
      this.$emit('message-delivery', {
        runId: this.resolvedRunId || this.parentCallId,
        text,
        delivery: this.delivery,
      });
      this.messageText = '';
    },
    emitTaskToggle(task: AgentRunTask) {
      const next = task.status === 'done' ? 'pending' : 'done';
      this.$emit('task-toggle', {
        runId: this.resolvedRunId || this.parentCallId,
        taskId: task.id,
        status: next,
      });
    },
  },
  render(h: any) {
    const ring =
      this.isRunning && this.status !== 'paused' && !this.awaitingApproval ? progressRingAttrs(28) : null;

    const reviewBtn = this.awaitingApproval
      ? h(
          'button',
          {
            class: 'nexus-tool-run__btn nexus-tool-run__btn--ok nexus-sub-agent__review-btn',
            attrs: { type: 'button', title: 'Review what the subagent needs approval for' },
            on: { click: (ev: Event) => this.emitReviewApproval(ev) },
          },
          'Review',
        )
      : null;

    const approvalBlock = this.awaitingApproval
      ? h('div', { class: 'nexus-sub-agent__approval', attrs: { role: 'status' } }, [
          h('div', { class: 'nexus-sub-agent__approval-text' }, [
            h('div', { class: 'nexus-tool-run__kicker' }, this.approvalTitle),
            h('div', { class: 'nexus-sub-agent__muted' }, this.approvalDetail),
          ]),
          reviewBtn,
        ])
      : null;

    const openBtn = this.canOpenChat
      ? h(
          'button',
          {
            class: 'nexus-tool-run__btn nexus-tool-run__btn--ok nexus-sub-agent__open-btn',
            attrs: { type: 'button', title: 'Open subagent conversation' },
            on: {
              click: (ev: Event) => this.emitOpen(ev),
            },
          },
          'View chat',
        )
      : null;

    const controls = h('div', { class: 'nexus-sub-agent__controls' }, [
      openBtn,
      this.isRunning && this.canPause && !this.awaitingApproval
        ? h(
            'button',
            {
              class: 'nexus-tool-run__btn nexus-tool-run__btn--ghost',
              attrs: { type: 'button', disabled: this.status === 'paused' },
              on: { click: this.emitPause },
            },
            this.status === 'paused' ? 'Paused' : 'Pause',
          )
        : null,
      this.isRunning && this.canCancel
        ? h(
            'button',
            {
              class: 'nexus-tool-run__btn nexus-tool-run__btn--danger',
              attrs: { type: 'button' },
              on: { click: this.emitCancel },
            },
            'Cancel',
          )
        : null,
    ]);

    const planBlock =
      this.showPlanTasks && this.resolvedPlan
        ? h('div', { class: 'nexus-sub-agent__plan' }, [
            h('div', { class: 'nexus-tool-run__kicker' }, this.resolvedPlan.title || 'Plan'),
            this.resolvedPlan.summary
              ? h(
                  'div',
                  { class: 'nexus-sub-agent__muted' },
                  String(this.resolvedPlan.summary).slice(0, 280),
                )
              : null,
            Array.isArray(this.resolvedPlan.steps)
              ? h(
                  'ol',
                  { class: 'nexus-sub-agent__steps' },
                  this.resolvedPlan.steps.map((step, i) =>
                    h('li', { key: step.id || i }, [
                      h('span', {}, step.title),
                      step.status
                        ? h(
                            'span',
                            { class: ['nexus-tool-run__chip', toolStatusClass(String(step.status))] },
                            toolStatusLabel(String(step.status)),
                          )
                        : null,
                    ]),
                  ),
                )
              : null,
          ])
        : null;

    const tasksBlock =
      this.showPlanTasks && this.resolvedTasks.length
        ? h(
            'ul',
            { class: 'nexus-sub-agent__tasks' },
            this.resolvedTasks.map((task) =>
              h('li', { key: task.id }, [
                h('input', {
                  class: 'nexus-sub-agent__check',
                  attrs: { type: 'checkbox', checked: task.status === 'done' },
                  on: { change: () => this.emitTaskToggle(task) },
                }),
                h('span', { class: 'nexus-sub-agent__task-title' }, task.title),
                h(
                  'span',
                  { class: ['nexus-tool-run__chip', toolStatusClass(String(task.status || ''))] },
                  toolStatusLabel(String(task.status || '')),
                ),
              ]),
            ),
          )
        : null;

    const messageBox =
      this.showMessageBox && this.isRunning
        ? h('div', { class: 'nexus-sub-agent__message' }, [
            h('div', { class: 'nexus-sub-agent__delivery-row' }, [
              h(DeliveryModePicker, {
                props: { value: this.delivery, compact: true },
                on: { input: (v: MessageDelivery) => (this.delivery = v) },
              }),
              this.canOpenChat
                ? h(
                    'button',
                    {
                      class: 'nexus-tool-run__btn nexus-tool-run__btn--ok',
                      attrs: { type: 'button', title: 'Open subagent conversation' },
                      on: {
                        click: (ev: Event) => this.emitOpen(ev),
                      },
                    },
                    'View chat',
                  )
                : null,
            ]),
            h('div', { class: 'nexus-sub-agent__compose' }, [
              h('input', {
                class: 'nexus-sub-agent__input',
                attrs: {
                  type: 'text',
                  placeholder: 'Message…',
                  value: this.messageText,
                },
                on: {
                  input: (e: Event) => {
                    this.messageText = (e.target as HTMLInputElement).value;
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      this.emitMessage();
                    }
                  },
                },
              }),
              h(
                'button',
                {
                  class: 'nexus-tool-run__btn nexus-tool-run__btn--ok',
                  attrs: {
                    type: 'button',
                    disabled: !String(this.messageText || '').trim(),
                  },
                  on: { click: this.emitMessage },
                },
                'Send',
              ),
            ]),
          ])
        : null;

    const header = h(
      'div',
      {
        class: 'nexus-sub-agent__header',
        attrs: {
          role: 'button',
          tabindex: '0',
          'aria-expanded': String(this.open),
          'aria-label': `Subagent: ${this.mission || 'run'}`,
          title: this.mission || undefined,
        },
        on: {
          click: () => (this.open = !this.open),
          keydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this.open = !this.open;
            }
          },
        },
      },
      [
        ring
          ? h(
              'svg',
              {
                class: 'nexus-sub-agent__ring',
                attrs: {
                  width: '16',
                  height: '16',
                  viewBox: '0 0 20 20',
                  'aria-hidden': 'true',
                },
              },
              [
                h('circle', {
                  attrs: {
                    cx: 10,
                    cy: 10,
                    r: ring.r,
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': 2,
                    opacity: 0.2,
                  },
                }),
                h('circle', {
                  class: 'nexus-sub-agent__ring-fill',
                  attrs: {
                    cx: 10,
                    cy: 10,
                    r: ring.r,
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': 2,
                    'stroke-dasharray': ring.c,
                    'stroke-dashoffset': ring.offset,
                    'stroke-linecap': 'round',
                  },
                }),
              ],
            )
          : h('span', {
              class: ['nexus-tool-run__dot', this.chipInfo.cls],
              attrs: { 'aria-hidden': 'true' },
            }),
        h('span', { class: 'nexus-sub-agent__title' }, this.missionTitle),
        this.elapsedLabel
          ? h(
              'span',
              {
                class: 'nexus-sub-agent__elapsed',
                attrs: { title: 'Time running', 'aria-live': 'off' },
              },
              this.elapsedLabel,
            )
          : null,
        h('span', { class: ['nexus-tool-run__chip', this.chipInfo.cls] }, this.chipInfo.label),
        this.tokensUsed
          ? h('span', { class: 'nexus-sub-agent__meta' }, `${this.tokensUsed} tok`)
          : null,
        this.currentTool && this.isRunning
          ? h(
              'span',
              { class: 'nexus-sub-agent__meta nexus-sub-agent__meta--mono' },
              truncateLabel(this.currentTool, 24),
            )
          : null,
        !this.open ? reviewBtn : null,
        !this.open ? openBtn : null,
        h(
          'span',
          { class: 'nexus-tool-run__chev', attrs: { 'aria-hidden': 'true' } },
          this.open ? '▾' : '▸',
        ),
      ],
    );

    const liveBlock =
      this.liveToolRows.length || this.liveOutputTail
        ? h(
            'div',
            {
              class: 'nexus-sub-agent__live',
              attrs: { 'aria-label': 'Subagent live activity', 'aria-live': 'polite' },
            },
            [
              this.liveToolRows.length
                ? h(
                    'div',
                    { class: 'nexus-sub-agent__live-tools' },
                    this.liveToolRows.map((row: LiveToolRow) =>
                      h('div', { key: row.callId, class: 'nexus-sub-agent__live-row' }, [
                        h('span', {
                          class: ['nexus-tool-run__dot', toolStatusClass(row.status)],
                          attrs: { 'aria-hidden': 'true' },
                        }),
                        h(
                          'span',
                          {
                            class: [
                              'nexus-sub-agent__live-label',
                              row.accessKind === 'write' ? 'nexus-sub-agent__live-label--write' : '',
                            ],
                            attrs: { title: row.label },
                          },
                          row.label,
                        ),
                        row.hint
                          ? h(
                              'span',
                              {
                                class: 'nexus-sub-agent__live-hint',
                                attrs: { title: row.hint },
                              },
                              row.hint,
                            )
                          : null,
                        h(
                          'span',
                          { class: ['nexus-tool-run__chip', toolStatusClass(row.status)] },
                          toolStatusLabel(row.status),
                        ),
                      ]),
                    ),
                  )
                : null,
              this.liveOutputTail
                ? h(
                    'div',
                    {
                      class: [
                        'nexus-sub-agent__live-out',
                        this.isRunning ? 'nexus-sub-agent__live-out--streaming' : '',
                      ],
                      attrs: { title: 'Recent reasoning / output' },
                    },
                    this.liveOutputTail,
                  )
                : null,
            ],
          )
        : null;

    const summaryBlock =
      this.summaryText
        ? h('div', {
            class: ['nexus-sub-agent__summary-md', CHAT_MARKDOWN_ROOT_CLASS],
            domProps: { innerHTML: renderChatMarkdown(this.summaryText.slice(0, 4000)) },
            attrs: { 'aria-label': 'Subagent summary' },
          })
        : null;

    const body = this.open
      ? h(
          'div',
          {
            class: 'nexus-sub-agent__body',
            attrs: { role: 'region', 'aria-label': 'Subagent details' },
          },
          [
            approvalBlock,
            controls,
            liveBlock,
            planBlock,
            tasksBlock,
            summaryBlock,
            this.canViewToolDetails && this.summary && !this.summaryText
              ? h('div', { class: 'nexus-sub-agent__details' }, [
                  h(
                    'button',
                    {
                      class: 'nexus-tool-run__btn nexus-tool-run__btn--ghost',
                      attrs: { type: 'button' },
                      on: { click: () => (this.showSummaryJson = !this.showSummaryJson) },
                    },
                    this.showSummaryJson ? 'Hide details' : 'Details',
                  ),
                  this.showSummaryJson
                    ? h(
                        'pre',
                        { class: 'nexus-tool-run__pre' },
                        JSON.stringify(this.summary, null, 2).slice(0, 2000),
                      )
                    : null,
                ])
              : null,
            messageBox,
          ],
        )
      : null;

    return h(
      'div',
      {
        class: [
          'nexus-sub-agent',
          this.isRunning ? 'nexus-sub-agent--running' : '',
          this.finalStatus === 'error' ? 'nexus-sub-agent--error' : '',
          this.open ? 'nexus-sub-agent--open' : '',
        ],
        attrs: { 'aria-live': 'polite' },
      },
      [header, body],
    );
  },
};

export default SubAgentRunWidget;
