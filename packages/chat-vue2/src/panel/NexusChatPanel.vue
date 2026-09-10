<template>
  <div
    class="nexus-chat-panel"
    :class="{ collapsed: collapsed, 'nexus-chat-panel--dragover': dragOver }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      v-if="dragOver"
      class="nexus-drop-overlay"
      aria-hidden="true"
    >
      <div class="nexus-drop-overlay__inner">{{ resolvedLabels.dropFiles }}</div>
    </div>
    <div
      class="nexus-chat-panel__header"
      :class="{ 'nexus-chat-panel__header--draggable': headerDraggable }"
      @pointerdown="onHeaderPointerDown"
    >
      <div class="nexus-chat-panel__header-left">
        <div class="nexus-chat-panel__avatar" aria-hidden="true">
          <img
            v-if="contactAvatarUrl && !avatarImgFailed"
            :src="contactAvatarUrl"
            alt=""
            @error="avatarImgFailed = true"
          />
          <span v-else>{{ contactInitials }}</span>
          <span
            v-if="contactType === 'agent'"
            class="nexus-chat-panel__avatar-badge nexus-chat-panel__avatar-badge--ai"
          >AI</span>
          <span
            v-else-if="contactType === 'group'"
            class="nexus-chat-panel__avatar-badge nexus-chat-panel__avatar-badge--group"
          >G</span>
        </div>
        <div class="nexus-chat-panel__header-titles">
          <span class="nexus-chat-panel__title">{{ contactName }}</span>
          <span v-if="contactTypeBadge" class="nexus-chat-panel__type-badge">{{ contactTypeBadge }}</span>
        </div>
        <span v-if="resolvedPanel.unreadCount" class="nexus-badge">{{ resolvedPanel.unreadCount }}</span>
      </div>
      <div class="nexus-chat-panel__header-actions" @pointerdown.stop>
        <slot
          name="header-actions"
          :mode-transition="modeTransitionState"
          :start-mode-transition="startModeTransition"
          :cancel-mode-transition="cancelModeTransition"
        />
        <button
          v-if="showDefaultContextButton"
          type="button"
          class="nexus-btn-link"
          title="Context"
          @click="$emit('toggle-context')"
        >
          ◉
        </button>
        <button
          type="button"
          class="nexus-btn-link"
          :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
          @click="$emit('toggle-sidebar')"
        >
          {{ sidebarOpen ? '◫' : '◻' }}
        </button>
        <button type="button" class="nexus-btn-link" @click="$emit('toggle-collapse')">
          {{ collapsed ? '▴' : '▾' }}
        </button>
        <button type="button" class="nexus-btn-link nexus-btn-link--danger" @click="$emit('close')">
          ×
        </button>
      </div>
    </div>

    <div v-show="!collapsed" class="nexus-chat-panel__body">
      <aside v-if="sidebarOpen" class="nexus-chat-panel__sidebar">
        <slot
          name="sidebar-main"
          :panel="resolvedPanel"
          :contacts="resolvedContacts"
          :rooms="rooms"
        >
          <div class="nexus-sidebar-title">{{ resolvedLabels.contacts }}</div>
          <ul class="nexus-contacts-list">
            <li
              v-for="c in resolvedContacts"
              :key="c.id"
              class="nexus-contact-row"
              :class="{ active: c.id === resolvedPanel.contactId }"
              @click="$emit('select-contact', c)"
            >
              <div class="nexus-contact-row__top">
                <span>{{ c.name }}</span>
                <span v-if="c.unreadCount" class="nexus-badge">{{ c.unreadCount }}</span>
              </div>
              <div v-if="c.lastMessagePreview" class="nexus-contact-preview">{{ c.lastMessagePreview }}</div>
            </li>
          </ul>
          <div v-if="rooms.length" class="nexus-sidebar-title">{{ resolvedLabels.rooms }}</div>
          <ul v-if="rooms.length" class="nexus-contacts-list">
            <li
              v-for="room in rooms"
              :key="room.id"
              class="nexus-contact-row"
              :class="{ active: room.id === resolvedPanel.roomId }"
              @click="$emit('select-room', room)"
            >
              <div>{{ room.title }}</div>
              <div v-if="room.participantCount != null" class="nexus-contact-preview">
                {{ room.participantCount }} participants
              </div>
            </li>
          </ul>
        </slot>
        <slot
          name="sidebar-extra"
          :panel="resolvedPanel"
          :contacts="resolvedContacts"
        />
        <session-summary-chips
          v-if="resolvedPanel.conversationId"
          :conversation-id="resolvedPanel.conversationId"
          :get-summary="summaryGetter"
        />
        <div class="nexus-sidebar-footer">
          <button type="button" class="nexus-btn nexus-btn--block" @click="$emit('create-room', { panelIndex })">
            {{ resolvedLabels.newRoom }}
          </button>
        </div>
        <div v-if="pendingApprovalsCount" class="nexus-sidebar-footer">
          <span class="nexus-badge nexus-badge--warn">{{ pendingApprovalsCount }} {{ resolvedLabels.pending }}</span>
        </div>
      </aside>

      <div class="nexus-chat-panel__main">
        <slot
          name="disclosure"
          :panel="resolvedPanel"
          :contact-name="contactName"
          :contact-type="contactType"
        />

        <div
          v-if="resolvedPanel.throttle && (resolvedPanel.throttle.remainingMs || resolvedPanel.throttle.lockedUntil)"
          class="nexus-alert"
        >
          <div class="nexus-alert__title">{{ resolvedLabels.throttled }}</div>
          <div>
            {{ resolvedPanel.throttle.reason || 'Wait before sending again.' }}
            <span v-if="resolvedPanel.throttle.remainingMs"> Retry in {{ panelThrottleRemainingSec }}s.</span>
            <span v-if="lockedUntilLabel"> Locked until {{ lockedUntilLabel }}.</span>
          </div>
        </div>
        <div v-if="showBillingIssueSlot" class="nexus-billing-issue-slot">
          <slot name="credits-topup" :panel="resolvedPanel" :issue="resolvedPanel.billingIssue" />
        </div>
        <div v-else-if="creditsInsufficient" class="nexus-alert">
          <div class="nexus-alert__title">{{ resolvedLabels.creditsInsufficient || 'Insufficient credits' }}</div>
          <div>
            {{ resolvedLabels.creditsInsufficientHint || 'Top up credits to continue chatting.' }}
            <slot name="credits-topup" :panel="resolvedPanel" />
          </div>
        </div>
        <div
          v-if="resolvedPanel.spendLimits && resolvedPanel.spendLimits.reached && !showBillingIssueSlot"
          class="nexus-alert"
        >
          <div class="nexus-alert__title">{{ resolvedLabels.spendLimit }}</div>
          <div>{{ resolvedLabels.spendLimitHint }}</div>
        </div>

        <div class="nexus-chat-panel__toolbar">
          <slot
            name="toolbar"
            :panel="resolvedPanel"
            :attachment-supported="attachmentSupported"
            :call-supported="callSupported"
            :upload-in-flight="uploadInFlight"
            :can-add-more="canAddMore"
            :pick-attachment="pickAttachment"
          >
            <button
              type="button"
              class="nexus-btn"
              :disabled="!attachmentSupported || !canAddMore"
              @click="pickAttachment"
            >
              {{ resolvedLabels.attach }}
            </button>
            <button
              type="button"
              class="nexus-btn"
              :disabled="!callSupported"
              @click="$emit('open-call-chooser', resolvedPanel)"
            >
              {{ resolvedLabels.call }}
            </button>
          </slot>
        </div>

        <div class="nexus-chat-panel__meta">
          <span>Usage: {{ usageSummary }}</span>
          <span v-if="resolvedPanel.credits && resolvedPanel.credits.usedCents != null">
            {{ spendChromeLabel }}: {{ formatMoney(resolvedPanel.credits.usedCents, displayCurrency) }}
          </span>
          <span v-if="modeBadgeVisible" class="nexus-mode-badge">
            <span class="nexus-mode-badge__label">Mode</span>
            <span v-if="modeTransitionState.phase === 'transitioning'" class="nexus-mode-transition">
              <span class="nexus-mode-transition__ring" style="width: 14px; height: 14px;">
                <svg width="14" height="14" class="nexus-mode-transition__svg">
                  <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="2" class="nexus-checkback__track" />
                  <circle
                    cx="7"
                    cy="7"
                    r="5.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    class="nexus-mode-transition__progress"
                    :stroke-dasharray="modeRingCircumference"
                    :stroke-dashoffset="modeRingDashOffset"
                  />
                </svg>
              </span>
              <span class="nexus-mode-transition__labels">
                <span class="nexus-mode-transition__from">{{ modeLabelFor(modeTransitionState.from) }}</span>
                <span class="nexus-mode-transition__arrow">→</span>
                <span class="nexus-mode-transition__to">{{ modeLabelFor(modeTransitionState.to) }}</span>
                <span class="nexus-mode-transition__countdown">{{ modeTransitionCountdown }}</span>
              </span>
            </span>
            <span v-else>{{ modeLabelFor(resolvedPanel.chatMode) }}</span>
          </span>
        </div>

        <div
          v-if="resolvedPanel.activeCall && resolvedPanel.activeCall.mode !== 'browser'"
          class="nexus-voice-session"
        >
          <div class="nexus-alert__title">{{ resolvedLabels.voiceSession }}</div>
          <div>Status: {{ resolvedPanel.activeCall.status || 'connecting' }}</div>
          <div
            v-if="resolvedPanel.activeCall.mode === 'inbound' && resolvedPanel.activeCall.dialIn"
            class="nexus-muted"
          >
            <div v-if="resolvedPanel.activeCall.dialIn.phoneE164 || resolvedPanel.activeCall.dialIn.phoneDisplay">
              {{ resolvedLabels.dial }}:
              {{ resolvedPanel.activeCall.dialIn.phoneDisplay || resolvedPanel.activeCall.dialIn.phoneE164 }}
            </div>
            <div v-if="resolvedPanel.activeCall.dialIn.accessCode">
              {{ resolvedLabels.code }}: {{ resolvedPanel.activeCall.dialIn.accessCode }}
            </div>
          </div>
          <div v-else class="nexus-muted">Call: {{ resolvedPanel.activeCall.callSid }}</div>
          <button
            type="button"
            class="nexus-btn-link"
            @click="$emit('end-call', { panelIndex, call: resolvedPanel.activeCall })"
          >
            {{ resolvedLabels.endCall }}
          </button>
        </div>

        <realtime-call-panel
          v-if="resolvedPanel.activeCall && resolvedPanel.activeCall.mode === 'browser'"
          :surface="browserCallSurface"
          :minimized="false"
          mode="browser"
          @minimize="$emit('minimize-call')"
          @toggle-mute="$emit('toggle-mute')"
          @pause-resume="$emit('pause-resume')"
          @end="$emit('end-call', { panelIndex, call: resolvedPanel.activeCall })"
          @retry="$emit('retry-call', { panelIndex, call: resolvedPanel.activeCall })"
        />

        <slot name="queue" :panel="resolvedPanel" />

        <div
          ref="messagesEl"
          class="nexus-chat-panel__messages"
          @scroll="onMessageListScroll"
        >
          <div ref="messagesContentEl">
          <div class="nexus-muted nexus-messages-label">{{ resolvedLabels.messages }}</div>
          <div
            v-for="turn in resolvedPanel.turns"
            :key="turn.id"
            class="nexus-message-row"
            :class="'nexus-message-row--' + turn.role"
          >
            <div class="nexus-message-bubble" :class="turn.role">
              <div v-if="turn.compaction" class="nexus-compaction">
                {{ resolvedLabels.contextCompacted }}
                <span v-if="turn.compaction.beforeTokens != null">
                  ({{ turn.compaction.beforeTokens }} → {{ turn.compaction.afterTokens }} tokens)
                </span>
              </div>
              <div v-if="turn.mentions && turn.mentions.length" class="nexus-mentions">
                <span v-for="m in turn.mentions" :key="m.id" class="nexus-chip">@{{ m.label || m.id }}</span>
              </div>
              <div class="nexus-chat-markdown" v-html="renderMarkdown(turn.text)" />
              <div v-if="turnAttachments(turn).length" class="nexus-attachment-chips">
                <span
                  v-for="attachment in turnAttachments(turn)"
                  :key="attachment.ref || attachment.filename"
                  class="nexus-chip"
                  :title="attachment.ref"
                >
                  {{ attachment.filename || attachment.ref }}
                </span>
              </div>
              <tool-call-timeline
                v-if="timelineEvents(turn).length"
                :events="timelineEvents(turn)"
                :tool-events="turn.rawToolStream || []"
                :streaming="resolvedPanel.streaming"
                :conversation-id="resolvedPanel.conversationId"
                :choice-active="isChoiceActive(turn)"
                :poll-workload="pollWorkload"
                :trigger-check-back="triggerCheckBack"
                :mode-transition="modeTransitionState"
                @approve="$emit('approve-tool', $event)"
                @revert="$emit('revert-tool', $event)"
                @choice-select="$emit('choice-select', $event)"
                @check-back-resume="$emit('check-back-resume')"
                @switch-mode="onSwitchModeRequested"
              />
              <div
                v-if="turn.role === 'user' && turn.deliveryStatus"
                class="nexus-delivery"
                :class="'nexus-delivery--' + turn.deliveryStatus"
              >
                <span v-if="turn.deliveryStatus === 'sending'" class="nexus-delivery__status">
                  <span class="nexus-spin">↻</span> Sending…
                </span>
                <span v-else-if="turn.deliveryStatus === 'sent'" class="nexus-delivery__status">
                  ✓ Sent
                </span>
                <button
                  v-else-if="turn.deliveryStatus === 'failed'"
                  type="button"
                  class="nexus-delivery__status nexus-delivery__status--failed"
                  @click="toggleDeliveryError(turn.id)"
                >
                  ⚠ Failed — tap for details
                </button>
                <div
                  v-if="turn.deliveryStatus === 'failed' && expandedDeliveryErrorId === turn.id"
                  class="nexus-delivery__error"
                >
                  <div class="nexus-delivery__error-code">{{ (turn.deliveryError && turn.deliveryError.code) || 'error' }}</div>
                  <div>{{ (turn.deliveryError && turn.deliveryError.message) || 'Message failed to send' }}</div>
                  <pre
                    v-if="turn.deliveryError && turn.deliveryError.details"
                    class="nexus-delivery__error-details"
                  >{{ turn.deliveryError.details }}</pre>
                </div>
              </div>
            </div>
            <button
              v-if="turn.text"
              type="button"
              class="nexus-btn-link"
              title="Copy"
              @click="copyMessage(turn.text)"
            >
              ⎘
            </button>
            <slot name="message-actions" :turn="turn" :panel="resolvedPanel" />
          </div>
          <div v-if="resolvedPanel.streaming" class="nexus-muted">
            <span class="nexus-spin">↻</span> {{ resolvedLabels.streaming }}
          </div>
          </div>
        </div>

        <group-room-leave-section
          v-if="resolvedPanel.roomId && getRoom && leaveRoom"
          :room-id="resolvedPanel.roomId"
          :get-room="getRoom"
          :leave-room="leaveRoom"
          @left="$emit('left-room', $event)"
        />

        <div class="nexus-chat-panel__approvals">
          <slot name="data-access" :panel="resolvedPanel" />
        </div>

        <div class="nexus-chat-panel__composer">
          <composer-attachment-rail
            :items="railItems"
            :can-add-more="attachmentSupported && canAddMore && pendingItems.length > 0"
            :labels="attachmentRailLabels"
            @remove="removePendingItem"
            @retry="retryPendingItem"
            @add-more="pickAttachment"
          />
          <slot
            name="composer"
            :draft="draft"
            :set-draft="setDraft"
            :send="send"
            :can-send="canSend"
            :disabled="isComposerDisabled"
            :attachment-supported="attachmentSupported"
            :call-supported="callSupported"
            :upload-in-flight="uploadInFlight"
            :can-add-more="canAddMore"
            :pick-attachment="pickAttachment"
            :onPaste="onComposerPaste"
            :ingestFiles="ingestFiles"
            :mode-transition="modeTransitionState"
            :start-mode-transition="startModeTransition"
            :cancel-mode-transition="cancelModeTransition"
          >
            <textarea
              :value="draft"
              class="nexus-composer-input"
              rows="2"
              :placeholder="resolvedLabels.composerPlaceholder"
              :disabled="isComposerDisabled"
              @input="onDraftInput"
              @paste="onComposerPaste"
              @keydown.enter.exact.prevent="onEnterSend"
            />
            <div class="nexus-composer-footer">
              <span v-if="isComposerDisabled || sendBlockedHint" class="nexus-warn">
                {{
                  sendBlockedHint ||
                  (throttled
                    ? `Throttled — ${panelThrottleRemainingSec}s`
                    : uploadInFlight
                      ? resolvedLabels.uploading
                      : '')
                }}
              </span>
              <span v-else />
              <slot
                name="composer-actions"
                :panel="resolvedPanel"
                :streaming="resolvedPanel.streaming"
              />
              <button
                v-if="resolvedPanel.streaming"
                type="button"
                class="nexus-btn"
                @click="$emit('cancel-stream', { panelIndex, conversationId: resolvedPanel.conversationId })"
              >
                Cancel
              </button>
              <button type="button" class="nexus-btn nexus-btn--primary" :disabled="!canSend" @click="send">
                {{ resolvedLabels.send }}
              </button>
            </div>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  findChatContact,
  collectFilesFromClipboard,
  collectFilesFromDataTransfer,
  dataTransferHasFiles,
  looksLikeImageFile,
  partitionChatAttachmentFiles,
  snapshotChatFiles,
  uploadOptsForChatFileDestination,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  isUploadAbortError,
  useModeTransition,
  formatModeTransitionCountdown,
  modeLabel,
} from '@nexus/chat-core';
import { renderChatMarkdown } from '../markdown';
import { ToolCallTimeline, toolTimelineProps, ensureToolWidgetStyles } from '../tools';
import GroupRoomLeaveSection from './GroupRoomLeaveSection.vue';
import ComposerAttachmentRail from './ComposerAttachmentRail.vue';
import RealtimeCallPanel from '../voice/RealtimeCallPanel.vue';
import SessionSummaryChips from './SessionSummaryChips.vue';
import { DEFAULT_PANEL_LABELS, formatMoneyMinor, spendLabelForCurrency } from './labels';
import { createMessageListAutoScroll } from './message-list-scroll';

function emptyPanel() {
  return {
    id: 'embed',
    contactId: null,
    roomId: null,
    turns: [],
    streaming: false,
    unreadCount: 0,
    conversationId: null,
    activeCall: null,
    throttle: null,
    spendLimits: null,
    credits: null,
    billingIssue: null,
    usage: null,
    queuedMessages: [],
  };
}

export default {
  name: 'NexusChatPanel',
  components: {
    ToolCallTimeline,
    GroupRoomLeaveSection,
    RealtimeCallPanel,
    SessionSummaryChips,
    ComposerAttachmentRail,
  },
  props: {
    /** Optional chat-core controller — embed mode binds panel state from subscribe(). */
    chat: { type: Object, default: null },
    panel: { type: Object, default: null },
    panelIndex: { type: Number, default: 0 },
    contacts: { type: Array, default: () => [] },
    rooms: { type: Array, default: () => [] },
    collapsed: { type: Boolean, default: false },
    sidebarOpen: { type: Boolean, default: true },
    /** When false, host provides its own context % / History / Compact cluster in header-actions. */
    showDefaultContextButton: { type: Boolean, default: true },
    /** Allow parent floating shell to drag via the header. */
    headerDraggable: { type: Boolean, default: false },
    pendingApprovalsCount: { type: Number, default: 0 },
    getRoom: { type: Function, default: null },
    leaveRoom: { type: Function, default: null },
    pollWorkload: { type: Function, default: null },
    triggerCheckBack: { type: Function, default: null },
    uploadAttachment: { type: Function, default: null },
    labels: { type: Object, default: () => ({}) },
    throttledExternal: { type: Boolean, default: false },
    throttleRemainingMs: { type: Number, default: 0 },
    /** When chat is set, send via chat.sendMessage unless a host @send listener is present. */
    autoSend: { type: Boolean, default: true },
    /** P8-8/C-4e: shared mode-transition timer duration — default is a confirmation affordance, not a spinner. */
    modeTransitionDurationMs: { type: Number, default: 600 },
  },
  data() {
    return {
      draft: '',
      pendingItems: [],
      uploadPumpRunning: false,
      dragDepth: 0,
      embedState: null,
      embedUnsubscribe: null,
      expandedDeliveryErrorId: null,
      // P8-8: single `useModeTransition` instance owned by the panel, shared by
      // the header chip (via the header-actions scoped slot), the message-level
      // badge below, and ToolCallTimeline's ModeRefusalChipWidget — so all three
      // surfaces agree on "current" mid-transition. The controller itself
      // (functions only) is kept off `data` to avoid Vue2 reactivity walking it;
      // only the plain-object state snapshot is reactive.
      modeTransitionState: null,
      avatarImgFailed: false,
    };
  },
  computed: {
    resolvedLabels() {
      return { ...DEFAULT_PANEL_LABELS, ...(this.labels || {}) };
    },
    panelFromChat() {
      if (!this.chat) return null;
      const state = this.embedState || (this.chat.getState && this.chat.getState()) || {};
      return {
        ...emptyPanel(),
        contactId: state.selectedContactId || state.contactId || null,
        roomId: state.selectedRoomId || state.roomId || null,
        turns: state.turns || state.messages || [],
        streaming: !!state.streaming,
        conversationId: state.conversationId || null,
        unreadCount: state.unreadCount || 0,
        usage: state.usage || null,
        credits: state.credits || null,
        billingIssue: state.billingIssue || null,
        throttle: state.throttle || null,
        spendLimits: state.spendLimits || null,
        activeCall: state.activeCall || null,
        queuedMessages: state.queuedMessages || [],
        aiDisclosure: state.aiDisclosure || null,
      };
    },
    resolvedPanel() {
      return this.panel || this.panelFromChat || emptyPanel();
    },
    resolvedContacts() {
      if (this.contacts && this.contacts.length) return this.contacts;
      if (this.chat && this.chat.getState) {
        return (this.embedState || this.chat.getState()).contacts || [];
      }
      return [];
    },
    contactRecord() {
      return findChatContact(this.resolvedContacts, this.resolvedPanel.contactId);
    },
    contactName() {
      const room = (this.rooms || []).find(
        (entry) => entry.id === this.resolvedPanel.roomId || entry.id === this.resolvedPanel.contactId,
      );
      const panelName = this.resolvedPanel.name || this.resolvedPanel.contactName;
      const contactName = this.contactRecord && this.contactRecord.name;
      // Prefer a human name over an id/UUID that was mistakenly stored as panel.name.
      const panelLooksLikeId =
        panelName &&
        (panelName === this.resolvedPanel.contactId ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(panelName)));
      return (
        (room && room.title) ||
        contactName ||
        (!panelLooksLikeId && panelName) ||
        contactName ||
        'Chat'
      );
    },
    contactAvatarUrl() {
      return (
        (this.contactRecord && this.contactRecord.avatarUrl) ||
        this.resolvedPanel.avatarUrl ||
        null
      );
    },
    contactInitials() {
      const name = String(this.contactName || '?').trim();
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase() || '?';
    },
    contactTypeBadge() {
      // Agent identity is shown as an avatar overlay (Art. 50 visual signal).
      if (this.contactType === 'group') return 'Group';
      return '';
    },
    contactType() {
      return this.resolvedPanel.roomId
        ? 'group'
        : (this.contactRecord && this.contactRecord.type) || this.resolvedPanel.type || null;
    },
    sendBlockedHint() {
      if (this.resolvedPanel.streaming) return 'Waiting for response…';
      if (this.creditsInsufficient) return 'Insufficient credits';
      if (this.throttled) return `Throttled — ${this.panelThrottleRemainingSec}s`;
      return '';
    },
    throttled() {
      const t = this.resolvedPanel.throttle;
      return (
        this.throttledExternal ||
        Boolean(t && (t.remainingMs || t.lockedUntil || t.retryAfterMs))
      );
    },
    panelThrottleRemainingSec() {
      const t = this.resolvedPanel.throttle;
      let ms = (t && t.remainingMs) || this.throttleRemainingMs || 0;
      if ((!ms || ms <= 0) && t && t.lockedUntil) {
        const until = Date.parse(t.lockedUntil);
        if (Number.isFinite(until)) ms = Math.max(0, until - Date.now());
      }
      return Math.ceil(ms / 1000);
    },
    lockedUntilLabel() {
      const raw = this.resolvedPanel.throttle && this.resolvedPanel.throttle.lockedUntil;
      if (!raw) return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleString();
    },
    creditsInsufficient() {
      if (this.showBillingIssueSlot) return true;
      const c = this.resolvedPanel.credits;
      if (!c) return false;
      if (typeof c.availableCents === 'number' && c.availableCents <= 0) return true;
      const reason = String((this.resolvedPanel.throttle && this.resolvedPanel.throttle.reason) || '').toLowerCase();
      return reason.includes('insufficient') && reason.includes('credit');
    },
    showBillingIssueSlot() {
      return Boolean(this.resolvedPanel && this.resolvedPanel.billingIssue && this.resolvedPanel.billingIssue.code);
    },
    isComposerDisabled() {
      return (
        this.throttled ||
        this.creditsInsufficient ||
        this.showBillingIssueSlot ||
        (this.resolvedPanel.spendLimits && this.resolvedPanel.spendLimits.reached) ||
        this.resolvedPanel.streaming
      );
    },
    pendingAttachments() {
      return this.pendingItems
        .filter((item) => item && item.status === 'ready' && item.descriptor)
        .map((item) => item.descriptor);
    },
    uploadInFlight() {
      return this.pendingItems.some(
        (item) => item && (item.status === 'uploading' || item.status === 'queued'),
      );
    },
    canAddMore() {
      return this.pendingItems.length < MAX_CHAT_ATTACHMENTS_PER_MESSAGE;
    },
    railItems() {
      return this.pendingItems.map((item) => ({
        localId: item.localId,
        filename: item.filename,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        status: item.status,
        progress: item.progress,
        error: item.error,
        previewUrl: item.previewUrl,
        destLabel: this.itemDestLabel(item),
      }));
    },
    attachmentRailLabels() {
      return {
        uploading: this.resolvedLabels.uploading,
        queued: this.resolvedLabels.queued,
        uploadFailed: this.resolvedLabels.uploadFailed,
        removeAttachment: this.resolvedLabels.removeAttachment,
        cancelUpload: this.resolvedLabels.cancelUpload,
        retryUpload: this.resolvedLabels.retryUpload,
        addMore: this.resolvedLabels.addMore,
      };
    },
    canSend() {
      return (this.draft.trim().length > 0 || this.pendingAttachments.length > 0) && !this.isComposerDisabled;
    },
    displayCurrency() {
      return (
        (this.resolvedPanel.usage && this.resolvedPanel.usage.displayCurrency) ||
        (this.resolvedPanel.credits && this.resolvedPanel.credits.displayCurrency) ||
        null
      );
    },
    usageSummary() {
      const used = this.resolvedPanel.usage && this.resolvedPanel.usage.tokensUsed;
      const max = this.resolvedPanel.usage && this.resolvedPanel.usage.maxContextTokens;
      const usage = this.resolvedPanel.usage || {};
      const cost =
        usage.displayCostMinor != null
          ? usage.displayCostMinor
          : usage.costCents;
      const parts = [];
      if (used != null) parts.push(`${used} tok`);
      if (max != null) parts.push(`/${max}`);
      if (cost != null) parts.push(this.formatMoney(cost, this.displayCurrency));
      return parts.length ? parts.join(' ') : this.resolvedLabels.usageEmpty;
    },
    spendChromeLabel() {
      return spendLabelForCurrency(this.displayCurrency);
    },
    attachmentSupported() {
      return Boolean(this.uploadAttachment || (this.chat && this.chat.uploadAttachment));
    },
    dragOver() {
      return this.dragDepth > 0;
    },
    callSupported() {
      return this.contactType === 'agent' && Boolean(this.contactRecord && this.contactRecord.agentId);
    },
    summaryGetter() {
      if (this.chat && typeof this.chat.getConversationSummary === 'function') {
        return (convId) => this.chat.getConversationSummary(convId);
      }
      return null;
    },
    browserCallSurface() {
      const call = this.resolvedPanel.activeCall || {};
      return {
        status: call.status || 'connecting',
        elapsedSec: call.elapsedSec || 0,
        muted: !!call.muted,
        paused: !!call.paused,
        errorMessage: call.errorMessage || null,
        agentId: call.agentId || null,
        callSid: call.callSid || null,
        mode: call.mode || 'browser',
      };
    },
    // P8-8: message-level mode badge — visible once the host tracks a chatMode
    // on the panel, or while a transition (agent- or user-initiated) is in flight.
    modeBadgeVisible() {
      return Boolean(this.resolvedPanel.chatMode || (this.modeTransitionState && this.modeTransitionState.phase !== 'idle'));
    },
    modeRingCircumference() {
      return (2 * Math.PI * 5.5).toFixed(2);
    },
    modeRingDashOffset() {
      const progress = (this.modeTransitionState && this.modeTransitionState.progress) || 0;
      return (2 * Math.PI * 5.5 * (1 - progress)).toFixed(2);
    },
    modeTransitionCountdown() {
      return formatModeTransitionCountdown((this.modeTransitionState && this.modeTransitionState.remainingMs) || 0);
    },
    messageListAnchor() {
      const p = this.resolvedPanel || {};
      const turns = p.turns || [];
      const last = turns[turns.length - 1] || {};
      const text = last.text || last.content || '';
      const tools = (last.toolEvents && last.toolEvents.length) || 0;
      const stream = (last.rawToolStream && last.rawToolStream.length) || 0;
      return [
        p.conversationId || '',
        p.roomId || '',
        turns.length,
        last.id || '',
        String(text).length,
        tools,
        stream,
        p.streaming ? '1' : '0',
      ].join(':');
    },
  },
  watch: {
    contactAvatarUrl() {
      this.avatarImgFailed = false;
    },
    collapsed(val) {
      if (!val) this.pinAndScrollMessages();
    },
    'resolvedPanel.conversationId'() {
      this.pinAndScrollMessages();
    },
    'resolvedPanel.roomId'() {
      this.pinAndScrollMessages();
    },
    messageListAnchor() {
      this.scrollMessagesIfPinned();
    },
    chat: {
      immediate: true,
      handler(chat) {
        if (this.embedUnsubscribe) {
          this.embedUnsubscribe();
          this.embedUnsubscribe = null;
        }
        if (!chat || typeof chat.subscribe !== 'function') return;
        this.embedState = chat.getState ? chat.getState() : null;
        this.embedUnsubscribe = chat.subscribe((state) => {
          this.embedState = state;
        });
        if (typeof chat.loadContacts === 'function') {
          void chat.loadContacts();
        }
      },
    },
  },
  created() {
    ensureToolWidgetStyles();
    this._modeTransitionController = useModeTransition({ durationMs: this.modeTransitionDurationMs });
    this.modeTransitionState = this._modeTransitionController.getState();
    this._modeTransitionUnsubscribe = this._modeTransitionController.subscribe((state) => {
      this.modeTransitionState = state;
    });
  },
  mounted() {
    this._messageListScroll = createMessageListAutoScroll({
      getEl: () => this.messageListEl(),
    });
    this.bindMessageListObservers();
    this.pinAndScrollMessages();
  },
  beforeDestroy() {
    this.unbindMessageListObservers();
    if (this.embedUnsubscribe) this.embedUnsubscribe();
    if (this._modeTransitionUnsubscribe) this._modeTransitionUnsubscribe();
    if (this._modeTransitionController) this._modeTransitionController.destroy();
    this.revokeAllPreviews();
  },
  methods: {
    messageListEl() {
      return this.$refs.messagesEl || null;
    },
    onMessageListScroll() {
      if (this._messageListScroll) this._messageListScroll.onUserScroll();
    },
    pinAndScrollMessages() {
      if (this._messageListScroll) this._messageListScroll.pin();
      this.scrollMessagesIfPinned({ force: true });
    },
    scrollMessagesIfPinned(options) {
      this.$nextTick(() => {
        if (this._messageListScroll) this._messageListScroll.apply(options);
      });
    },
    bindMessageListObservers() {
      const el = this.messageListEl();
      if (!el || typeof ResizeObserver === 'undefined') return;
      this._messageListResizeObserver = new ResizeObserver(() => {
        this.scrollMessagesIfPinned();
      });
      this._messageListResizeObserver.observe(el);
      const content = this.$refs.messagesContentEl;
      if (content && content !== el) this._messageListResizeObserver.observe(content);
    },
    unbindMessageListObservers() {
      if (this._messageListResizeObserver) {
        this._messageListResizeObserver.disconnect();
        this._messageListResizeObserver = null;
      }
    },
    modeLabelFor(mode) {
      return modeLabel(mode);
    },
    /** Exposed for the header-actions scoped slot and for hosts calling via $refs. */
    startModeTransition(to, opts) {
      if (this._modeTransitionController) this._modeTransitionController.start(to, opts);
    },
    /** Recovery path when the actual mode-switch command dispatch fails. */
    cancelModeTransition() {
      if (this._modeTransitionController) this._modeTransitionController.cancel();
    },
    onSwitchModeRequested(payload) {
      // Presentation starts immediately so an agent-initiated switch looks
      // identical to a user-initiated one; the host performs the actual
      // dispatch (it owns the commandClient) and calls cancelModeTransition()
      // via $refs if the command fails.
      this.startModeTransition(payload.required, { from: payload.mode });
      this.$emit('switch-mode-requested', payload);
    },
    onHeaderPointerDown(ev) {
      if (!this.headerDraggable) return;
      const target = ev && ev.target;
      if (
        target &&
        typeof target.closest === 'function' &&
        target.closest(
          'button, a, input, select, textarea, label, [role="button"], .nexus-chat-panel__header-actions',
        )
      ) {
        return;
      }
      this.$emit('header-drag-start', ev);
    },
    setDraft(value) {
      this.draft = value == null ? '' : String(value);
    },
    onDraftInput(event) {
      this.draft = event.target.value;
    },
    renderMarkdown(text) {
      return renderChatMarkdown(text);
    },
    turnAttachments(turn) {
      return Array.isArray(turn && turn.attachments) ? turn.attachments : [];
    },
    timelineEvents(turn) {
      return toolTimelineProps((turn && turn.toolEvents) || []);
    },
    isChoiceActive(turn) {
      if (!turn || this.resolvedPanel.streaming) return false;
      const turns = this.resolvedPanel.turns || [];
      const last = turns[turns.length - 1];
      if (!last || last.id !== turn.id) return false;
      return (turn.toolEvents || []).some(
        (ev) =>
          ev.tool === 'ask_user_choice' &&
          ev.status !== 'error' &&
          ev.status !== 'reverted',
      );
    },
    formatMoney(cents, currency) {
      const cur =
        currency ||
        (this.resolvedPanel.usage && this.resolvedPanel.usage.displayCurrency) ||
        (this.resolvedPanel.credits && this.resolvedPanel.credits.displayCurrency) ||
        null;
      return formatMoneyMinor(cents, cur);
    },
    itemDestLabel(item) {
      if (!item) return '';
      if (item.destination === 'bucket') return this.resolvedLabels.destBucket;
      if (item.expires) return this.resolvedLabels.destExpires;
      return '';
    },
    previewUrlForFile(file) {
      if (!looksLikeImageFile(file) || typeof URL === 'undefined' || !URL.createObjectURL) return '';
      try {
        return URL.createObjectURL(file);
      } catch (_) {
        return '';
      }
    },
    revokePreviewUrl(url) {
      if (!url || typeof URL === 'undefined' || !URL.revokeObjectURL) return;
      try {
        URL.revokeObjectURL(url);
      } catch (_) {
        /* ignore */
      }
    },
    revokeAllPreviews() {
      this.pendingItems.forEach((item) => this.revokePreviewUrl(item && item.previewUrl));
    },
    newLocalId() {
      return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    },
    emitReject(file, reason) {
      const name = (file && file.name) || 'file';
      let message = `${name} could not be attached`;
      if (reason === 'empty') message = `${name} is empty`;
      if (reason === 'too_large') message = `${name} exceeds the 100 MiB limit`;
      if (reason === 'too_many') message = `At most 10 files per message (${name} skipped)`;
      const err = new Error(message);
      err.code = reason;
      err.filename = name;
      this.$emit('attachment-error', err);
    },
    async ingestFiles(files, destOpts = {}) {
      const uploader = this.uploadAttachment || (this.chat && this.chat.uploadAttachment);
      if (!uploader) {
        this.$emit('attachment-error', new Error('Upload not available'));
        return;
      }
      const raw = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!raw.length) return;
      let snapped = raw;
      try {
        snapped = await snapshotChatFiles(raw);
      } catch (err) {
        this.$emit('attachment-error', err instanceof Error ? err : new Error('Could not read file'));
        return;
      }
      const { accepted, rejected } = partitionChatAttachmentFiles(snapped, {
        alreadyPending: this.pendingItems.length,
      });
      rejected.forEach((row) => this.emitReject(row.file, row.reason));
      if (!accepted.length) return;
      const destination = destOpts.destination === 'bucket' ? 'bucket' : 'conversation';
      const uploadOpts = uploadOptsForChatFileDestination(destination, {
        workspaceId: destOpts.workspaceId,
        folderId: destOpts.folderId,
        withExpiry: destOpts.withExpiry,
        retentionPolicy: destOpts.retentionPolicy,
      });
      accepted.forEach((file) => {
        this.pendingItems.push({
          localId: this.newLocalId(),
          file,
          filename: file.name || 'attachment.bin',
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size || 0,
          status: 'queued',
          progress: 0,
          error: '',
          descriptor: null,
          fileId: null,
          previewUrl: this.previewUrlForFile(file),
          destination,
          expires: Boolean(destOpts.withExpiry || destOpts.retentionPolicy),
          uploadOpts,
          abort: null,
        });
      });
      void this.runUploadPump();
    },
    async runUploadPump() {
      if (this.uploadPumpRunning) return;
      this.uploadPumpRunning = true;
      try {
        while (true) {
          const next = this.pendingItems.find((item) => item && item.status === 'queued');
          if (!next) break;
          await this.uploadOne(next);
        }
      } finally {
        this.uploadPumpRunning = false;
      }
    },
    async uploadOne(item) {
      const uploader = this.uploadAttachment || (this.chat && this.chat.uploadAttachment);
      if (!uploader) {
        item.status = 'error';
        item.error = 'Upload not available';
        return;
      }
      const abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
      item.abort = abort;
      item.status = 'uploading';
      item.progress = 1;
      item.error = '';
      try {
        const uploaded = await uploader(item.file, {
          ...(item.uploadOpts || {}),
          signal: abort ? abort.signal : undefined,
          onProgress: (evt) => {
            const fraction = evt && typeof evt.fraction === 'number' ? evt.fraction : 0;
            item.progress = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
          },
        });
        const descriptor = (uploaded && uploaded.descriptor) || {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: (uploaded && (uploaded.fileId || uploaded.id)) || null,
          mimeType: (uploaded && uploaded.mimeType) || item.mimeType,
          filename: (uploaded && uploaded.filename) || item.filename,
        };
        if (!descriptor.ref) throw new Error('Upload did not return a region fileId');
        if (item.status === 'cancelling') {
          this.$emit('attachment-discard', { fileId: descriptor.ref });
          this.dropPendingItem(item.localId, { silent: true });
          return;
        }
        item.descriptor = descriptor;
        item.fileId = descriptor.ref;
        item.status = 'ready';
        item.progress = 100;
        item.abort = null;
      } catch (err) {
        if (isUploadAbortError(err) || item.status === 'cancelling') {
          this.dropPendingItem(item.localId, { silent: true });
          return;
        }
        // eslint-disable-next-line no-console
        console.warn('chat attachment upload failed', err);
        item.status = 'error';
        item.error = err && err.message ? err.message : String(err);
        item.abort = null;
        this.$emit('attachment-error', err);
      }
    },
    async offerIncomingFiles(files, fallbackDest) {
      const raw = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!raw.length) return;
      let snapped = raw;
      try {
        snapped = await snapshotChatFiles(raw);
      } catch (err) {
        this.$emit('attachment-error', err instanceof Error ? err : new Error('Could not read file'));
        return;
      }
      if (this.$listeners && this.$listeners['files-dropped']) {
        this.$emit('files-dropped', snapped);
        return;
      }
      void this.ingestFiles(snapped, fallbackDest || { destination: 'conversation' });
    },
    onComposerPaste(event) {
      const files = collectFilesFromClipboard(event && event.clipboardData);
      if (!files.length) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const text =
        event && event.clipboardData && typeof event.clipboardData.getData === 'function'
          ? String(event.clipboardData.getData('text/plain') || '')
          : '';
      if (text) this.setDraft((this.draft || '') + text);
      void this.offerIncomingFiles(files, { destination: 'conversation', withExpiry: true });
    },
    transferHasFiles(event) {
      return dataTransferHasFiles(event && event.dataTransfer);
    },
    onDragEnter(event) {
      if (!this.attachmentSupported || !this.transferHasFiles(event)) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.dragDepth += 1;
    },
    onDragOver(event) {
      if (!this.attachmentSupported || !this.transferHasFiles(event)) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave() {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
    },
    onDrop(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this.dragDepth = 0;
      if (!this.attachmentSupported) return;
      const files = collectFilesFromDataTransfer(event && event.dataTransfer);
      if (!files.length) return;
      void this.offerIncomingFiles(files, { destination: 'conversation', withExpiry: true });
    },
    async pickAttachment() {
      const uploader = this.uploadAttachment || (this.chat && this.chat.uploadAttachment);
      if (!uploader || !this.canAddMore) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = async () => {
        const list = input.files ? Array.from(input.files) : [];
        if (!list.length) return;
        await this.ingestFiles(list, { destination: 'conversation' });
      };
      input.click();
    },
    removePendingItem(localId) {
      const item = this.pendingItems.find((row) => row && row.localId === localId);
      if (!item) return;
      if (item.status === 'uploading' && item.abort) {
        item.status = 'cancelling';
        try {
          item.abort.abort();
        } catch (_) {
          /* ignore */
        }
        return;
      }
      if (item.fileId) this.$emit('attachment-discard', { fileId: item.fileId });
      this.dropPendingItem(localId);
    },
    retryPendingItem(localId) {
      const item = this.pendingItems.find((row) => row && row.localId === localId);
      if (!item || item.status !== 'error') return;
      item.status = 'queued';
      item.progress = 0;
      item.error = '';
      void this.runUploadPump();
    },
    dropPendingItem(localId, opts = {}) {
      const idx = this.pendingItems.findIndex((row) => row && row.localId === localId);
      if (idx < 0) return;
      const item = this.pendingItems[idx];
      this.revokePreviewUrl(item && item.previewUrl);
      this.pendingItems.splice(idx, 1);
      if (!opts.silent) return;
    },
    async send() {
      if (!this.canSend) {
        this.$emit('send-blocked', {
          reason: this.sendBlockedHint || 'empty',
          panelIndex: this.panelIndex,
        });
        return;
      }
      const readyItems = this.pendingItems.filter((item) => item && item.status === 'ready');
      const leftover = this.pendingItems.filter((item) => item && item.status !== 'ready');
      const attachments = readyItems.map((item) => item.descriptor).filter(Boolean);
      const payload = {
        text: this.draft.trim(),
        panelIndex: this.panelIndex,
        attachments,
      };
      const snapshot = {
        text: this.draft,
        pendingItems: readyItems.map((item) => ({ ...item, abort: null })),
      };
      const previewUrls = readyItems.map((item) => item.previewUrl).filter(Boolean);
      this.draft = '';
      this.pendingItems = leftover;
      const hostHandlesSend = Boolean(this.$listeners && this.$listeners.send);
      try {
        if (
          this.autoSend &&
          this.chat &&
          typeof this.chat.sendMessage === 'function' &&
          !hostHandlesSend
        ) {
          const result = await this.chat.sendMessage(payload.text, {
            contactId: this.resolvedPanel.contactId || undefined,
            roomId: this.resolvedPanel.roomId || undefined,
            attachments: payload.attachments,
          });
          if (result && result.ok === false) {
            this.restoreDraft(snapshot);
            this.$emit('send-failed', { ...result, panelIndex: this.panelIndex, snapshot });
          } else {
            this.revokeUrlList(previewUrls);
          }
          return;
        }
        this.$emit('send', {
          ...payload,
          _draftSnapshot: snapshot,
          restoreDraft: () => this.restoreDraft(snapshot),
        });
        this.$nextTick(() => {
          this.revokeUrlList(previewUrls);
        });
      } catch (err) {
        this.restoreDraft(snapshot);
        this.$emit('send-failed', {
          ok: false,
          code: 'exception',
          message: err && err.message ? err.message : String(err),
          panelIndex: this.panelIndex,
          snapshot,
        });
      }
    },
    onEnterSend() {
      if (!this.canSend) {
        this.$emit('send-blocked', {
          reason: this.sendBlockedHint || 'empty',
          panelIndex: this.panelIndex,
        });
        return;
      }
      return this.send();
    },
    restoreDraft(snapshot) {
      if (!snapshot) return;
      this.draft = snapshot.text == null ? '' : String(snapshot.text);
      const restored = Array.isArray(snapshot.pendingItems)
        ? snapshot.pendingItems.map((item) => ({ ...item, abort: null }))
        : [];
      if (restored.length) {
        this.pendingItems = restored.concat(this.pendingItems);
      }
    },
    revokeUrlList(urls) {
      if (!urls || !urls.length || typeof URL === 'undefined' || !URL.revokeObjectURL) return;
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          /* ignore */
        }
      });
    },
    copyMessage(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      this.$emit('copy-message', text);
    },
    toggleDeliveryError(turnId) {
      this.expandedDeliveryErrorId =
        this.expandedDeliveryErrorId === turnId ? null : turnId;
    },
  },
};
</script>

<style scoped>
.nexus-chat-panel {
  width: 420px;
  max-height: 620px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
  font-family: inherit;
  font-size: 13px;
}
.nexus-chat-panel.collapsed {
  max-height: none;
}
.nexus-chat-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #e9ecef;
  flex-shrink: 0;
}
.nexus-chat-panel__header--draggable {
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.nexus-chat-panel__header--draggable:active {
  cursor: grabbing;
}
.nexus-chat-panel__header-left,
.nexus-chat-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nexus-chat-panel__avatar {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #51cbce;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  overflow: visible;
  flex-shrink: 0;
}
.nexus-chat-panel__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
.nexus-chat-panel__avatar-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 4px;
  border: 1px solid #fff;
  z-index: 1;
}
.nexus-chat-panel__avatar-badge--ai {
  background: #6f42c1;
  color: #fff;
}
.nexus-chat-panel__avatar-badge--group {
  background: #51bcda;
  color: #fff;
}
.nexus-chat-panel__header-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}
.nexus-chat-panel__title {
  font-weight: 700;
  color: #66615b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.nexus-chat-panel__type-badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6c757d;
}
.nexus-chat-panel__body {
  display: flex;
  flex: 1;
  min-height: 0;
  max-height: none;
}
.nexus-chat-panel__sidebar {
  width: 168px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e9ecef;
  background: #fff;
}
.nexus-sidebar-title {
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #6c757d;
  text-transform: uppercase;
}
.nexus-contacts-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}
.nexus-contact-row {
  padding: 8px;
  cursor: pointer;
}
.nexus-contact-row:hover,
.nexus-contact-row.active {
  background: #f5f5f5;
}
.nexus-contact-row__top {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}
.nexus-contact-preview {
  color: #6c757d;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nexus-sidebar-footer {
  padding: 4px 8px;
}
.nexus-chat-panel__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
}
.nexus-chat-panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid #e9ecef;
}
.nexus-chat-panel__meta {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid #e9ecef;
  color: #6c757d;
  font-size: 12px;
}
.nexus-chat-panel__messages {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
  padding: 8px;
}
.nexus-messages-label {
  margin-bottom: 8px;
}
.nexus-message-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
}
.nexus-message-row--user {
  justify-content: flex-end;
}
.nexus-message-bubble {
  padding: 6px 10px;
  border-radius: 10px;
  max-width: 85%;
}
.nexus-message-bubble.user {
  background: #51cbce;
  color: #fff;
  margin-left: auto;
}
.nexus-message-bubble.assistant {
  background: #f0f0f0;
}
.nexus-message-bubble.system {
  background: #fff3cd;
  font-style: italic;
}
.nexus-delivery {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.3;
}
.nexus-delivery__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0.9;
}
.nexus-delivery--sending .nexus-delivery__status {
  opacity: 0.85;
}
.nexus-delivery--sent .nexus-delivery__status {
  opacity: 0.7;
}
.nexus-delivery__status--failed {
  border: 0;
  background: transparent;
  color: #fff;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  font: inherit;
}
.nexus-message-bubble.user .nexus-delivery__status--failed {
  color: #fff;
}
.nexus-delivery__error {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.18);
  color: #fff;
  white-space: pre-wrap;
  word-break: break-word;
}
.nexus-delivery__error-code {
  font-weight: 700;
  margin-bottom: 2px;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.02em;
}
.nexus-delivery__error-details {
  margin: 6px 0 0;
  font-size: 10px;
  opacity: 0.9;
  white-space: pre-wrap;
}
.nexus-chat-panel__approvals {
  flex-shrink: 0;
  min-width: 0;
  max-height: 46%;
  overflow-x: hidden;
  overflow-y: auto;
}
.nexus-chat-panel__approvals:empty {
  display: none;
}
.nexus-chat-panel__composer {
  border-top: 1px solid #e9ecef;
  padding: 8px;
  flex-shrink: 0;
}
.nexus-composer-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ced4da;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  resize: vertical;
}
.nexus-composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.nexus-attachment-chips,
.nexus-mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.nexus-voice-session {
  padding: 6px 8px;
  border-bottom: 1px solid #e9ecef;
  font-size: 12px;
}
.nexus-alert {
  padding: 8px;
  background: #fff3cd;
  border-bottom: 1px solid #ffeeba;
  font-size: 12px;
}
.nexus-alert__title {
  font-weight: 700;
}
.nexus-badge {
  display: inline-block;
  background: #51cbce;
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 11px;
}
.nexus-badge--warn {
  background: #ffc107;
  color: #212529;
}
.nexus-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  max-width: 160px;
}
.nexus-chip--with-thumb {
  flex-direction: column;
  align-items: flex-start;
  padding: 4px;
  max-width: 96px;
}
.nexus-chip__thumb {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 3px;
  background: #111;
  display: block;
}
.nexus-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.nexus-chip__badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #6c757d;
}
.nexus-chip__remove {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  color: #6c757d;
  font-size: 14px;
}
.nexus-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(81, 203, 206, 0.16);
  border: 2px dashed #51cbce;
  pointer-events: none;
}
.nexus-drop-overlay__inner {
  font-weight: 600;
  color: #117a7c;
  background: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.nexus-chat-panel--dragover {
  outline: none;
}
.nexus-btn {
  border: 1px solid #ced4da;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.nexus-btn--primary {
  background: #51cbce;
  border-color: #51cbce;
  color: #fff;
}
.nexus-btn--block {
  width: 100%;
}
.nexus-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.nexus-btn-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}
.nexus-btn-link--danger {
  color: #dc3545;
}
.nexus-muted {
  color: #6c757d;
  font-size: 12px;
}
.nexus-warn {
  color: #856404;
  font-size: 12px;
}
.nexus-compaction {
  color: #6c757d;
  font-size: 11px;
  margin-bottom: 4px;
}
.nexus-spin {
  display: inline-block;
  animation: nexus-spin 1s linear infinite;
}
@keyframes nexus-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
