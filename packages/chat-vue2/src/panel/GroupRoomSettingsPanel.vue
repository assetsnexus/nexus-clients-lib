<template>
  <div v-if="roomId" class="nexus-room-settings">
    <div class="nexus-room-settings__header">
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
        <!-- Participants -->
        <section class="nexus-room-settings__section">
          <div class="nexus-room-settings__section-title">
            Participants ({{ detail.participants.length }})
          </div>
          <ul class="nexus-room-settings__list">
            <li
              v-for="p in detail.participants"
              :key="p.id"
              class="nexus-room-settings__participant"
            >
              <span>{{ p.displayName || p.username || p.id }}</span>
              <span class="nexus-badge-sm">{{ p.type }}{{ p.role ? ` · ${p.role}` : '' }}</span>
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

        <!-- AI participant upsert -->
        <section v-if="detail.viewerIsOwner" class="nexus-room-settings__section">
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
 * Room settings panel — participants, encryption mode, invites, AI participant upsert.
 * Ported from inference React GroupRoomSettingsDialog UX reference.
 */
import RoomOrchestrationSection from './RoomOrchestrationSection.vue';
import RoomParticipantsAiConfig from './RoomParticipantsAiConfig.vue';

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
    upsertAiParticipantFn: { type: Function, default: null },
    updateRoomOrchestration: { type: Function, default: null },
    models: { type: Array, default: () => [] },
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
    };
  },
  watch: {
    roomId() {
      this.reset();
    },
  },
  methods: {
    reset() {
      this.settingsOpen = false;
      this.loading = false;
      this.busy = false;
      this.loadError = null;
      this.actionError = null;
      this.detail = null;
      this.inviteCode = '';
      this.inviteExpiresAt = '';
      this.aiParticipantId = '';
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
.nexus-room-settings__encryption-mode {
  margin-bottom: 6px;
  font-family: monospace;
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
