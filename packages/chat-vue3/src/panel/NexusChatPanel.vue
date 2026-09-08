<template>
  <div class="nexus-chat-panel" :class="{ collapsed: collapsed }">
    <div class="nexus-chat-panel__header">
      <div class="nexus-chat-panel__header-left">
        <span class="nexus-chat-panel__title">{{ contactName }}</span>
        <span v-if="resolvedPanel.unreadCount" class="nexus-badge">{{ resolvedPanel.unreadCount }}</span>
      </div>
      <div class="nexus-chat-panel__header-actions">
        <slot name="header-actions" />
        <button type="button" class="nexus-btn-link" title="Context" @click="$emit('toggle-context')">
          ◉
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
        <slot
          name="sidebar-extra"
          :panel="resolvedPanel"
          :contacts="resolvedContacts"
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
        <div v-if="creditsInsufficient" class="nexus-alert">
          <div class="nexus-alert__title">{{ resolvedLabels.creditsInsufficient || 'Insufficient credits' }}</div>
          <div>
            {{ resolvedLabels.creditsInsufficientHint || 'Top up credits to continue chatting.' }}
            <slot name="credits-topup" :panel="resolvedPanel" />
          </div>
        </div>
        <div v-if="resolvedPanel.spendLimits && resolvedPanel.spendLimits.reached" class="nexus-alert">
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
            :pick-attachment="pickAttachment"
          >
            <button
              type="button"
              class="nexus-btn"
              :disabled="!attachmentSupported || uploadInFlight"
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
            Credits: {{ formatMoney(resolvedPanel.credits.usedCents) }}
          </span>
        </div>

        <div v-if="pendingAttachments.length" class="nexus-attachment-chips">
          <span
            v-for="attachment in pendingAttachments"
            :key="attachment.ref"
            class="nexus-chip"
          >
            {{ attachment.filename || attachment.ref }}
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

        <div ref="messagesEl" class="nexus-chat-panel__messages">
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
                @approve="$emit('approve-tool', $event)"
                @revert="$emit('revert-tool', $event)"
                @choice-select="$emit('choice-select', $event)"
                @check-back-resume="$emit('check-back-resume')"
              />
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

        <group-room-leave-section
          v-if="resolvedPanel.roomId && getRoom && leaveRoom"
          :room-id="resolvedPanel.roomId"
          :get-room="getRoom"
          :leave-room="leaveRoom"
          @left="$emit('left-room', $event)"
        />

        <div class="nexus-chat-panel__composer">
          <slot
            name="composer"
            :draft="draft"
            :set-draft="setDraft"
            :send="send"
            :can-send="canSend"
            :disabled="isComposerDisabled"
          >
            <textarea
              :value="draft"
              class="nexus-composer-input"
              rows="2"
              :placeholder="resolvedLabels.composerPlaceholder"
              :disabled="isComposerDisabled"
              @input="onDraftInput"
              @keydown.enter.exact.prevent="send"
            />
            <div class="nexus-composer-footer">
              <span v-if="isComposerDisabled" class="nexus-warn">
                {{
                  throttled
                    ? `Throttled — ${panelThrottleRemainingSec}s`
                    : uploadInFlight
                      ? resolvedLabels.uploading
                      : ''
                }}
              </span>
              <span v-else />
              <slot
                name="composer-actions"
                :panel="resolvedPanel"
                :streaming="resolvedPanel.streaming"
              />
              <button type="button" class="nexus-btn nexus-btn--primary" :disabled="!canSend" @click="send">
                {{ resolvedLabels.send }}
              </button>
            </div>
          </slot>
        </div>
      </div>
    </div>

    <slot name="data-access" :panel="resolvedPanel" />
  </div>
</template>

<script>
import { renderChatMarkdown } from '../markdown';
import { ToolCallTimeline, toolTimelineProps, ensureToolWidgetStyles } from '../tools';
import GroupRoomLeaveSection from './GroupRoomLeaveSection.vue';
import RealtimeCallPanel from '../voice/RealtimeCallPanel.vue';
import { DEFAULT_PANEL_LABELS, formatCreditCents } from './labels';

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
    pendingApprovalsCount: { type: Number, default: 0 },
    getRoom: { type: Function, default: null },
    leaveRoom: { type: Function, default: null },
    pollWorkload: { type: Function, default: null },
    triggerCheckBack: { type: Function, default: null },
    uploadAttachment: { type: Function, default: null },
    labels: { type: Object, default: () => ({}) },
    throttledExternal: { type: Boolean, default: false },
    throttleRemainingMs: { type: Number, default: 0 },
    /** When chat is set, send via chat.sendMessage (embed mode). */
    autoSend: { type: Boolean, default: true },
  },
  data() {
    return {
      draft: '',
      pendingAttachments: [],
      uploadInFlight: false,
      embedState: null,
      embedUnsubscribe: null,
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
      return this.resolvedContacts.find((x) => x.id === this.resolvedPanel.contactId) || null;
    },
    contactName() {
      const room = (this.rooms || []).find(
        (entry) => entry.id === this.resolvedPanel.roomId || entry.id === this.resolvedPanel.contactId,
      );
      return (
        (room && room.title) ||
        (this.contactRecord && this.contactRecord.name) ||
        this.resolvedPanel.contactId ||
        'Chat'
      );
    },
    contactType() {
      return this.resolvedPanel.roomId
        ? 'group'
        : (this.contactRecord && this.contactRecord.type) || null;
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
      const c = this.resolvedPanel.credits;
      if (!c) return false;
      if (typeof c.availableCents === 'number' && c.availableCents <= 0) return true;
      const reason = String((this.resolvedPanel.throttle && this.resolvedPanel.throttle.reason) || '').toLowerCase();
      return reason.includes('insufficient') && reason.includes('credit');
    },
    isComposerDisabled() {
      return (
        this.throttled ||
        this.creditsInsufficient ||
        this.resolvedPanel.streaming ||
        this.uploadInFlight
      );
    },
    canSend() {
      return (this.draft.trim().length > 0 || this.pendingAttachments.length > 0) && !this.isComposerDisabled;
    },
    usageSummary() {
      const used = this.resolvedPanel.usage && this.resolvedPanel.usage.tokensUsed;
      const max = this.resolvedPanel.usage && this.resolvedPanel.usage.maxContextTokens;
      const cost = this.resolvedPanel.usage && this.resolvedPanel.usage.costCents;
      const parts = [];
      if (used != null) parts.push(`${used} tok`);
      if (max != null) parts.push(`/${max}`);
      if (cost != null) parts.push(this.formatMoney(cost));
      return parts.length ? parts.join(' ') : this.resolvedLabels.usageEmpty;
    },
    attachmentSupported() {
      return Boolean(this.uploadAttachment || (this.chat && this.chat.uploadAttachment));
    },
    callSupported() {
      return this.contactType === 'agent' && Boolean(this.contactRecord && this.contactRecord.agentId);
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
  },
  watch: {
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
  },
  beforeUnmount() {
    if (this.embedUnsubscribe) this.embedUnsubscribe();
  },
  methods: {
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
    formatMoney(cents) {
      return formatCreditCents(cents);
    },
    async pickAttachment() {
      const uploader = this.uploadAttachment || (this.chat && this.chat.uploadAttachment);
      if (!uploader || this.uploadInFlight) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,audio/*,text/*,application/json';
      input.onchange = async () => {
        const file = input.files && input.files[0] ? input.files[0] : null;
        if (!file) return;
        this.uploadInFlight = true;
        try {
          const uploaded = await uploader(file);
          const descriptor = (uploaded && uploaded.descriptor) || {
            kind: 'entity',
            entityType: 'conversation_attachment',
            ref: (uploaded && (uploaded.fileId || uploaded.id)) || null,
            mimeType: (uploaded && uploaded.mimeType) || file.type,
            filename: (uploaded && uploaded.filename) || file.name,
          };
          if (!descriptor.ref) throw new Error('Upload did not return a region fileId');
          this.pendingAttachments.push(descriptor);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('chat attachment upload failed', err);
          this.$emit('attachment-error', err);
        } finally {
          this.uploadInFlight = false;
        }
      };
      input.click();
    },
    async send() {
      if (!this.canSend) return;
      const payload = {
        text: this.draft.trim(),
        panelIndex: this.panelIndex,
        attachments: this.pendingAttachments.slice(),
      };
      this.draft = '';
      this.pendingAttachments = [];
      if (this.autoSend && this.chat && typeof this.chat.sendMessage === 'function') {
        await this.chat.sendMessage(payload.text, {
          contactId: this.resolvedPanel.contactId || undefined,
          roomId: this.resolvedPanel.roomId || undefined,
          attachments: payload.attachments,
        });
        this.$emit('send', payload);
        return;
      }
      this.$emit('send', payload);
    },
    copyMessage(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      this.$emit('copy-message', text);
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
}
.nexus-chat-panel__header-left,
.nexus-chat-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nexus-chat-panel__title {
  font-weight: 700;
}
.nexus-chat-panel__body {
  display: flex;
  min-height: 320px;
  max-height: 560px;
}
.nexus-chat-panel__sidebar {
  width: 130px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e9ecef;
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
.nexus-chat-panel__composer {
  border-top: 1px solid #e9ecef;
  padding: 8px;
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
  display: inline-block;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
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
