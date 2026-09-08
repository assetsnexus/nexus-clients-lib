<template>
  <div v-if="roomId" class="nexus-group-room-leave">
    <div class="nexus-group-room-leave__row">
      <span class="nexus-group-room-leave__title">Leave group</span>
      <button
        type="button"
        class="nexus-btn"
        :disabled="busy"
        @click="toggleOpen"
      >
        {{ leaveOpen ? 'Cancel' : 'Leave…' }}
      </button>
    </div>

    <div v-if="leaveOpen" class="nexus-group-room-leave__body">
      <div v-if="loading" class="nexus-muted">Loading room…</div>
      <div v-else-if="loadError" class="nexus-error">{{ loadError }}</div>
      <template v-else>
        <template v-if="isOwner">
          <label class="nexus-radio">
            <input v-model="leaveAction" type="radio" value="archive">
            <span>Archive group (auto-deleted after 14 days)</span>
          </label>
          <label class="nexus-radio">
            <input v-model="leaveAction" type="radio" value="transfer_and_leave">
            <span>Transfer ownership and leave</span>
          </label>
          <select
            v-if="leaveAction === 'transfer_and_leave'"
            v-model="newOwnerUserId"
            class="nexus-select"
            :disabled="busy || transferCandidates.length === 0"
          >
            <option v-if="transferCandidates.length === 0" value="">
              No eligible members
            </option>
            <option
              v-for="member in transferCandidates"
              :key="member.id"
              :value="member.id"
            >
              {{ memberLabel(member) }}
            </option>
          </select>
        </template>
        <p v-else class="nexus-muted">
          You will leave this group. Other members will see a history entry.
        </p>
        <div class="nexus-group-room-leave__actions">
          <button
            type="button"
            class="nexus-btn"
            :class="confirmButtonClass"
            :disabled="confirmDisabled"
            @click="confirmLeave"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </template>
      <div v-if="actionError" class="nexus-error">{{ actionError }}</div>
    </div>
  </div>
</template>

<script>
/**
 * Group leave UX: owner archive vs transfer picker; member leave.
 */
export default {
  name: 'GroupRoomLeaveSection',
  props: {
    roomId: { type: String, default: null },
    getRoom: { type: Function, required: true },
    leaveRoom: { type: Function, required: true },
  },
  data() {
    return {
      leaveOpen: false,
      loading: false,
      busy: false,
      loadError: null,
      actionError: null,
      leaveAction: 'leave',
      newOwnerUserId: '',
      detail: null,
    };
  },
  computed: {
    isOwner() {
      return Boolean(this.detail && this.detail.viewerIsOwner);
    },
    transferCandidates() {
      const ownerId = this.detail && this.detail.ownerUserId;
      const rows = Array.isArray(this.detail && this.detail.participants)
        ? this.detail.participants
        : [];
      return rows.filter((p) => p.type === 'user' && p.id && p.id !== ownerId);
    },
    confirmDisabled() {
      if (this.busy || this.loading) return true;
      if (
        this.isOwner &&
        this.leaveAction === 'transfer_and_leave' &&
        (!this.newOwnerUserId || this.transferCandidates.length === 0)
      ) {
        return true;
      }
      return false;
    },
    confirmLabel() {
      if (!this.isOwner) return 'Leave group';
      return this.leaveAction === 'archive' ? 'Archive group' : 'Transfer and leave';
    },
    confirmButtonClass() {
      if (this.isOwner && this.leaveAction === 'archive') return 'nexus-btn--danger';
      return '';
    },
  },
  watch: {
    roomId() {
      this.reset();
    },
  },
  methods: {
    memberLabel(member) {
      return member.displayName || member.username || member.id;
    },
    reset() {
      this.leaveOpen = false;
      this.loading = false;
      this.busy = false;
      this.loadError = null;
      this.actionError = null;
      this.leaveAction = 'leave';
      this.newOwnerUserId = '';
      this.detail = null;
    },
    async toggleOpen() {
      if (this.leaveOpen) {
        this.leaveOpen = false;
        return;
      }
      this.leaveOpen = true;
      this.actionError = null;
      await this.loadDetail();
    },
    async loadDetail() {
      if (!this.roomId || typeof this.getRoom !== 'function') return;
      this.loading = true;
      this.loadError = null;
      try {
        const detail = await this.getRoom(this.roomId);
        this.detail = detail;
        this.leaveAction = detail && detail.viewerIsOwner ? 'archive' : 'leave';
        this.newOwnerUserId = (this.transferCandidates[0] && this.transferCandidates[0].id) || '';
      } catch (err) {
        this.loadError = (err && err.message) || 'Failed to load room';
        this.detail = null;
      } finally {
        this.loading = false;
      }
    },
    async confirmLeave() {
      if (!this.roomId || typeof this.leaveRoom !== 'function') return;
      const summary = this.isOwner
        ? this.leaveAction === 'archive'
          ? 'Archive this group for everyone? It will be permanently deleted after 14 days.'
          : 'Transfer group ownership and leave? You will no longer manage this room.'
        : 'Leave this group? You can be invited again later.';
      if (typeof window !== 'undefined' && !window.confirm(summary)) return;

      this.busy = true;
      this.actionError = null;
      try {
        await this.leaveRoom({
          roomId: this.roomId,
          action: this.isOwner ? this.leaveAction : 'leave',
          newOwnerUserId:
            this.isOwner && this.leaveAction === 'transfer_and_leave'
              ? this.newOwnerUserId || undefined
              : undefined,
        });
        this.leaveOpen = false;
        this.$emit('left', { roomId: this.roomId });
      } catch (err) {
        this.actionError = (err && err.message) || 'Failed to leave group';
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>

<style scoped>
.nexus-group-room-leave {
  border-top: 1px solid #e9ecef;
  padding: 8px;
}
.nexus-group-room-leave__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.nexus-group-room-leave__title {
  font-size: 12px;
  font-weight: 700;
}
.nexus-group-room-leave__body {
  font-size: 12px;
}
.nexus-group-room-leave__actions {
  display: flex;
  justify-content: flex-end;
}
.nexus-radio {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}
.nexus-select {
  width: 100%;
  margin-bottom: 8px;
  padding: 4px 8px;
  font-size: 12px;
}
.nexus-muted {
  color: #6c757d;
}
.nexus-error {
  color: #dc3545;
  margin-top: 8px;
}
.nexus-btn {
  border: 1px solid #ced4da;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.nexus-btn--danger {
  border-color: #dc3545;
  color: #dc3545;
}
.nexus-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
