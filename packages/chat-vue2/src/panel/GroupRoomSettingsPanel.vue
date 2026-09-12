<template>
  <div v-if="roomId" class="nexus-room-settings" :class="{ 'nexus-room-settings--embedded': embedded }">
    <div v-if="!embedded" class="nexus-room-settings__header">
      <span class="nexus-room-settings__title">Room settings</span>
      <button
        type="button"
        class="nexus-btn"
        :disabled="busy"
        @click="toggleOpen"
      >
        {{ settingsOpen ? 'Close' : 'Settings…' }}
      </button>
    </div>

    <div v-if="settingsOpen" class="nexus-room-settings__body">
      <div v-if="loading" class="nexus-muted">Loading room…</div>
      <div v-else-if="loadError" class="nexus-error">{{ loadError }}</div>
      <template v-else-if="detail">
        <div class="nexus-room-settings__mode">
          <span v-if="detail.viewerIsOwner" class="nexus-badge-sm nexus-badge-sm--owner">Owner view</span>
          <span v-else-if="detail.viewerIsModerator" class="nexus-badge-sm">Moderator view</span>
          <span v-else class="nexus-badge-sm">Participant view</span>
          <span v-if="isGroup" class="nexus-muted">Group · {{ detail.participants.length }} members</span>
        </div>

        <section class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">
            Participants ({{ detail.participants.length }})
          </div>
          <ul class="nexus-room-settings__list">
            <li
              v-for="p in detail.participants"
              :key="p.type + ':' + p.id"
              class="nexus-room-settings__participant"
            >
              <button
                type="button"
                class="nexus-room-settings__person"
                @click="$emit('open-participant', p)"
              >
                <span class="nexus-room-settings__avatar" aria-hidden="true">
                  <img v-if="p.avatarUrl" :src="p.avatarUrl" alt="" />
                  <span v-else>{{ initials(p) }}</span>
                </span>
                <span class="nexus-room-settings__person-text">
                  <span class="nexus-room-settings__name">{{ participantLabel(p) }}</span>
                  <span class="nexus-badge-sm">{{ participantKind(p) }}</span>
                </span>
              </button>
              <button
                v-if="canRemoveParticipant(p)"
                type="button"
                class="nexus-btn nexus-btn--xs nexus-btn--danger"
                :disabled="busy"
                @click="removeParticipant(p)"
              >
                Remove
              </button>
            </li>
          </ul>
        </section>

        <section v-if="detail.viewerIsOwner && addRoomParticipant" class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">Add from contacts</div>
          <p class="nexus-muted nexus-room-settings__hint">
            Add people or agents already in your contacts. Users can join as participants or moderators.
          </p>
          <div class="nexus-room-settings__ai-row">
            <select v-model="addContactKey" class="nexus-input" :disabled="busy || !addableContacts.length">
              <option value="">{{ addableContacts.length ? 'Select a contact…' : 'No unused contacts' }}</option>
              <option
                v-for="c in addableContacts"
                :key="c.id"
                :value="contactKey(c)"
              >
                {{ c.name || c.id }} · {{ c.type === 'agent' ? 'agent' : 'user' }}
              </option>
            </select>
          </div>
          <div v-if="addContactIsUser" class="nexus-room-settings__role-row">
            <label class="nexus-room-settings__radio">
              <input v-model="addRole" type="radio" value="member" />
              Participant
            </label>
            <label class="nexus-room-settings__radio">
              <input v-model="addRole" type="radio" value="moderator" />
              Moderator
            </label>
          </div>
          <button
            type="button"
            class="nexus-btn nexus-btn--sm"
            :disabled="busy || !addContactKey"
            @click="addSelectedContact"
          >
            Add to room
          </button>
        </section>

        <section v-if="billingRows.length" class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">Agent costs</div>
          <ul class="nexus-room-settings__list">
            <li
              v-for="row in billingRows"
              :key="row.participantType + ':' + row.participantId"
              class="nexus-room-settings__cost-row"
            >
              <span>{{ billingName(row) }}</span>
              <span class="nexus-muted">{{ row.tokensUsed || 0 }} tok · {{ row.costCents || 0 }}¢</span>
              <span class="nexus-badge-sm">{{ row.payerLabel || row.payerType }}</span>
            </li>
          </ul>
          <div v-if="billingSummary && billingSummary.totalCostCents != null" class="nexus-muted">
            Total {{ billingSummary.totalCostCents }}¢
          </div>
        </section>

        <room-orchestration-section
          :detail="detail"
          :update-room-orchestration="updateRoomOrchestration"
          :busy="busy"
          @updated="loadDetail"
        />

        <room-participants-ai-config
          :detail="detail"
          :models="models"
          :upsert-ai-participant-fn="upsertAiParticipantFn"
          :busy="busy"
          @updated="loadDetail"
        />

        <!-- Encryption -->
        <section class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">Encryption</div>
          <div class="nexus-room-settings__encryption-mode">
            <span>{{ detail.encryptionMode || 'server_group_v1' }}</span>
          </div>
          <div v-if="detail.viewerIsOwner" class="nexus-room-settings__encryption-actions">
            <button
              v-if="detail.encryptionMode === 'server_group_v1'"
              type="button"
              class="nexus-btn nexus-btn--sm"
              :disabled="busy"
              @click="upgradeEncryption"
            >
              Upgrade to E2E
            </button>
            <button
              v-else-if="detail.encryptionMode === 'client_v1'"
              type="button"
              class="nexus-btn nexus-btn--sm"
              :disabled="busy"
              @click="downgradeEncryption"
            >
              Downgrade to server
            </button>
          </div>
        </section>

        <!-- Retention / disappearing messages -->
        <section v-if="detail.viewerIsOwner" class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">Disappearing messages</div>
          <p class="nexus-muted nexus-room-settings__hint">
            Applies to new messages. Uploaded chat media follows the same TTL when indexed with the message.
          </p>
          <div class="nexus-room-settings__ai-row">
            <select v-model="retentionPreset" class="nexus-input" :disabled="busy">
              <option
                v-for="opt in retentionOptions"
                :key="String(opt.value)"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <button
              type="button"
              class="nexus-btn nexus-btn--sm"
              :disabled="busy || !retentionDirty"
              @click="saveRetention"
            >
              Save
            </button>
          </div>
        </section>

        <!-- Invite link -->
        <section v-if="detail.viewerIsOwner" class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">Invite</div>
          <div v-if="inviteCode" class="nexus-room-settings__invite">
            <code>{{ inviteCode }}</code>
            <span v-if="inviteExpiresAt" class="nexus-muted">expires {{ inviteExpiresAt }}</span>
          </div>
          <button
            type="button"
            class="nexus-btn nexus-btn--sm"
            :disabled="busy"
            @click="createInvite"
          >
            {{ inviteCode ? 'Regenerate invite' : 'Create invite link' }}
          </button>
        </section>

        <!-- AI participant upsert (fallback when contacts picker is unavailable) -->
        <section v-if="detail.viewerIsOwner && !addRoomParticipant" class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">AI participant</div>
          <div class="nexus-room-settings__ai-row">
            <input
              v-model="aiParticipantId"
              class="nexus-input"
              placeholder="Agent or VE id"
            />
            <button
              type="button"
              class="nexus-btn nexus-btn--sm"
              :disabled="busy || !aiParticipantId"
              @click="upsertAiParticipant"
            >
              Upsert
            </button>
          </div>
        </section>

        <div v-if="actionError" class="nexus-error">{{ actionError }}</div>
      </template>
    </div>
  </div>
</template>

<script>
/**
 * Room settings panel — participants, encryption mode, retention, invites, AI participant upsert.
 * Ported from inference React GroupRoomSettingsDialog UX reference.
 */
import RoomOrchestrationSection from './RoomOrchestrationSection.vue';
import RoomParticipantsAiConfig from './RoomParticipantsAiConfig.vue';

const DEFAULT_TTL = 30 * 24 * 3600;
const RETENTION_PRESETS = [
  { value: String(7 * 24 * 3600), label: '7 days' },
  { value: String(DEFAULT_TTL), label: '30 days' },
  { value: String(90 * 24 * 3600), label: '90 days' },
  { value: 'off', label: 'Off (retain indefinitely)' },
];

function presetFromTtl(ttl) {
  if (ttl == null) return 'off';
  const match = RETENTION_PRESETS.find((p) => p.value !== 'off' && Number(p.value) === Number(ttl));
  return match ? match.value : String(ttl);
}

export default {
  name: 'GroupRoomSettingsPanel',
  components: {
    RoomOrchestrationSection,
    RoomParticipantsAiConfig,
  },
  props: {
    roomId: { type: String, default: null },
    getRoom: { type: Function, required: true },
    removeRoomParticipant: { type: Function, default: null },
    upgradeRoomEncryption: { type: Function, default: null },
    downgradeRoomEncryption: { type: Function, default: null },
    createRoomInvite: { type: Function, default: null },
    setRoomRetention: { type: Function, default: null },
    upsertAiParticipantFn: { type: Function, default: null },
    updateRoomOrchestration: { type: Function, default: null },
    addRoomParticipant: { type: Function, default: null },
    models: { type: Array, default: () => [] },
    contacts: { type: Array, default: () => [] },
    billingSummary: { type: Object, default: null },
    embedded: { type: Boolean, default: false },
  },
  data() {
    return {
      settingsOpen: false,
      loading: false,
      busy: false,
      loadError: null,
      actionError: null,
      detail: null,
      inviteCode: '',
      inviteExpiresAt: '',
      aiParticipantId: '',
      retentionPreset: String(DEFAULT_TTL),
      savedRetentionPreset: String(DEFAULT_TTL),
      retentionOptions: RETENTION_PRESETS,
      addContactKey: '',
      addRole: 'member',
    };
  },
  computed: {
    retentionDirty() {
      return this.retentionPreset !== this.savedRetentionPreset;
    },
    isGroup() {
      return !this.detail || this.detail.type !== 'dm';
    },
    billingRows() {
      const rows = this.billingSummary && Array.isArray(this.billingSummary.participants)
        ? this.billingSummary.participants
        : [];
      return rows;
    },
    addableContacts() {
      const present = new Set(
        ((this.detail && this.detail.participants) || []).map((p) => `${p.type}:${p.id}`),
      );
      return (this.contacts || []).filter((c) => {
        if (!c || !c.id) return false;
        const type = c.type === 'agent' ? 'agent' : 'user';
        if (type === 'user' && c.id === (this.detail && this.detail.viewerUserId)) return false;
        return !present.has(`${type}:${c.id}`) && !present.has(`agent:${c.virtualEmployeeId || ''}`);
      });
    },
    addContactIsUser() {
      const c = this.addableContacts.find((row) => this.contactKey(row) === this.addContactKey);
      return Boolean(c && c.type !== 'agent');
    },
  },
  watch: {
    roomId() {
      this.reset();
      if (this.embedded && this.roomId) this.openEmbedded();
    },
    embedded: {
      immediate: true,
      handler(value) {
        if (value && this.roomId) this.openEmbedded();
      },
    },
  },
  methods: {
    reset() {
      this.settingsOpen = this.embedded;
      this.loading = false;
      this.busy = false;
      this.loadError = null;
      this.actionError = null;
      this.detail = null;
      this.inviteCode = '';
      this.inviteExpiresAt = '';
      this.aiParticipantId = '';
      this.retentionPreset = String(DEFAULT_TTL);
      this.savedRetentionPreset = String(DEFAULT_TTL);
      this.addContactKey = '';
      this.addRole = 'member';
    },
    async openEmbedded() {
      this.settingsOpen = true;
      this.actionError = null;
      await this.loadDetail();
    },
    participantLabel(p) {
      return (p && (p.displayName || p.username || p.id)) || 'Unknown';
    },
    participantKind(p) {
      const type = p && p.type === 'virtual_agent' ? 'agent' : (p && p.type) || 'user';
      const role = p && p.role ? String(p.role) : '';
      if (type === 'agent') return 'AI agent';
      if (role === 'owner') return 'owner';
      if (role === 'moderator' || role === 'mod' || role === 'admin') return 'moderator';
      return 'participant';
    },
    initials(p) {
      const name = String(this.participantLabel(p) || '?').trim();
      const parts = name.replace(/^@/, '').split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase() || '?';
    },
    contactKey(c) {
      return `${c.type === 'agent' ? 'agent' : 'user'}:${c.id}`;
    },
    billingName(row) {
      const parts = (this.detail && this.detail.participants) || [];
      const hit = parts.find(
        (p) => p.type === row.participantType && p.id === row.participantId,
      );
      return this.participantLabel(hit || { id: row.participantId, type: row.participantType });
    },
    async addSelectedContact() {
      if (!this.addRoomParticipant || !this.addContactKey) return;
      const [type, id] = this.addContactKey.split(':');
      const contact = this.addableContacts.find((c) => this.contactKey(c) === this.addContactKey);
      if (!contact || !id) return;
      this.busy = true;
      this.actionError = null;
      try {
        const participant = {
          type: type === 'agent' ? (contact.virtualAgentId ? 'virtual_agent' : 'agent') : 'user',
          id: type === 'agent' ? String(contact.agentId || contact.id) : id,
          displayName: contact.name || undefined,
        };
        if (participant.type === 'user' && this.addRole === 'moderator') {
          participant.role = 'moderator';
        }
        await this.addRoomParticipant({
          roomId: this.roomId,
          participant,
        });
        this.addContactKey = '';
        this.addRole = 'member';
        await this.loadDetail();
      } catch (err) {
        this.actionError = (err && err.message) || 'Add participant failed';
      } finally {
        this.busy = false;
      }
    },
    async toggleOpen() {
      if (this.settingsOpen) {
        this.settingsOpen = false;
        return;
      }
      this.settingsOpen = true;
      this.actionError = null;
      await this.loadDetail();
    },
    async loadDetail() {
      if (!this.roomId || typeof this.getRoom !== 'function') return;
      this.loading = true;
      this.loadError = null;
      try {
        this.detail = await this.getRoom(this.roomId);
        const preset = presetFromTtl(this.detail && this.detail.messageTtlSeconds);
        this.retentionPreset = preset;
        this.savedRetentionPreset = preset;
      } catch (err) {
        this.loadError = (err && err.message) || 'Failed to load room';
        this.detail = null;
      } finally {
        this.loading = false;
      }
    },
    canRemoveParticipant(p) {
      if (!this.detail || !this.detail.viewerIsOwner) return false;
      if (!this.removeRoomParticipant) return false;
      return p.id !== this.detail.ownerUserId;
    },
    async removeParticipant(p) {
      if (!this.removeRoomParticipant) return;
      this.busy = true;
      this.actionError = null;
      try {
        await this.removeRoomParticipant({
          roomId: this.roomId,
          participantId: p.id,
          participantType: p.type,
        });
        await this.loadDetail();
      } catch (err) {
        this.actionError = (err && err.message) || 'Remove failed';
      } finally {
        this.busy = false;
      }
    },
    async upgradeEncryption() {
      if (!this.upgradeRoomEncryption) return;
      this.busy = true;
      this.actionError = null;
      try {
        const res = await this.upgradeRoomEncryption({
          roomId: this.roomId,
          targetMode: 'client_v1',
        });
        if (this.detail) this.detail.encryptionMode = res.encryptionMode;
        this.$emit('encryption-changed', res);
      } catch (err) {
        this.actionError = (err && err.message) || 'Encryption upgrade failed';
      } finally {
        this.busy = false;
      }
    },
    async downgradeEncryption() {
      if (!this.downgradeRoomEncryption) return;
      this.busy = true;
      this.actionError = null;
      try {
        const res = await this.downgradeRoomEncryption({
          roomId: this.roomId,
          targetMode: 'server_group_v1',
        });
        if (this.detail) this.detail.encryptionMode = res.encryptionMode;
        this.$emit('encryption-changed', res);
      } catch (err) {
        this.actionError = (err && err.message) || 'Encryption downgrade failed';
      } finally {
        this.busy = false;
      }
    },
    async saveRetention() {
      if (!this.setRoomRetention || !this.retentionDirty) return;
      this.busy = true;
      this.actionError = null;
      try {
        const messageTtlSeconds =
          this.retentionPreset === 'off' ? null : Number(this.retentionPreset);
        const res = await this.setRoomRetention({
          roomId: this.roomId,
          messageTtlSeconds,
        });
        if (this.detail) {
          this.detail.messageTtlSeconds =
            res && res.messageTtlSeconds !== undefined ? res.messageTtlSeconds : messageTtlSeconds;
        }
        this.savedRetentionPreset = this.retentionPreset;
      } catch (err) {
        this.actionError = (err && err.message) || 'Retention update failed';
      } finally {
        this.busy = false;
      }
    },
    async createInvite() {
      if (!this.createRoomInvite) return;
      this.busy = true;
      this.actionError = null;
      try {
        const res = await this.createRoomInvite({ roomId: this.roomId });
        this.inviteCode = res.inviteCode || '';
        this.inviteExpiresAt = res.expiresAt || '';
      } catch (err) {
        this.actionError = (err && err.message) || 'Invite creation failed';
      } finally {
        this.busy = false;
      }
    },
    async upsertAiParticipant() {
      if (!this.upsertAiParticipantFn || !this.aiParticipantId) return;
      this.busy = true;
      this.actionError = null;
      try {
        await this.upsertAiParticipantFn({
          roomId: this.roomId,
          participantType: 'agent',
          participantId: this.aiParticipantId.trim(),
        });
        this.aiParticipantId = '';
        await this.loadDetail();
      } catch (err) {
        this.actionError = (err && err.message) || 'AI participant upsert failed';
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>

<style scoped>
.nexus-room-settings {
  border-top: 1px solid #e9ecef;
  padding: 8px;
}
.nexus-room-settings--embedded {
  border-top: 0;
  padding: 0;
}
.nexus-room-settings__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.nexus-room-settings__title {
  font-size: 12px;
  font-weight: 700;
}
.nexus-room-settings__body {
  font-size: 12px;
}
.nexus-room-settings__mode {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.nexus-room-settings__section {
  margin-bottom: 12px;
}
.nexus-room-settings__section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #6c757d;
  margin-bottom: 4px;
}
.nexus-room-settings__list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.nexus-room-settings__participant {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.nexus-room-settings__person {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.nexus-room-settings__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #51cbce;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}
.nexus-room-settings__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.nexus-room-settings__person-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.nexus-room-settings__name {
  font-weight: 600;
  color: #66615b;
}
.nexus-room-settings__cost-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.nexus-room-settings__role-row {
  display: flex;
  gap: 12px;
  margin: 6px 0;
}
.nexus-room-settings__radio {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}
.nexus-badge-sm--owner {
  background: #51cbce;
  color: #fff;
}
.nexus-room-settings__encryption-mode {
  margin-bottom: 6px;
  font-family: monospace;
}
.nexus-room-settings__hint {
  font-size: 11px;
  margin: 0 0 8px;
}
.nexus-room-settings__encryption-actions {
  margin-bottom: 4px;
}
.nexus-room-settings__invite {
  margin-bottom: 6px;
}
.nexus-room-settings__invite code {
  font-size: 11px;
  word-break: break-all;
}
.nexus-room-settings__ai-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.nexus-badge-sm {
  font-size: 10px;
  padding: 1px 5px;
  background: #e9ecef;
  border-radius: 3px;
  color: #495057;
}
.nexus-input {
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  flex: 1;
}
.nexus-muted { color: #6c757d; }
.nexus-error { color: #dc3545; margin-top: 6px; }
.nexus-btn {
  border: 1px solid #ced4da;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.nexus-btn--sm { padding: 2px 8px; font-size: 11px; }
.nexus-btn--xs { padding: 1px 5px; font-size: 10px; }
.nexus-btn--danger { border-color: #dc3545; color: #dc3545; }
.nexus-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
