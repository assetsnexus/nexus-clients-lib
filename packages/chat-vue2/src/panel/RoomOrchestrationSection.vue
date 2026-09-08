<template>
  <section v-if="visible" class="nexus-room-orch">
    <div class="nexus-room-orch__title">AI orchestration</div>
    <p v-if="!canEdit" class="nexus-muted">Only the room owner or moderators can change AI settings.</p>
    <template v-else>
      <label class="nexus-room-orch__label">
        Default response mode
        <select
          class="nexus-room-orch__select"
          :value="defaultMode"
          :disabled="busy || localBusy"
          @change="onDefaultMode"
        >
          <option value="mention_only">@mention only</option>
          <option value="always">Always respond</option>
        </select>
      </label>

      <label class="nexus-room-orch__label">
        Group chat style
        <select
          class="nexus-room-orch__select"
          :value="autoChatStyle"
          :disabled="busy || localBusy"
          @change="onAutoChatStyle"
        >
          <option value="mixed">Mixed (default)</option>
          <option value="efficient">Efficient — minimal AI coordination</option>
          <option value="story">Story — in-character Discord-style chat</option>
        </select>
      </label>
      <p class="nexus-muted nexus-room-orch__hint">
        Mixed follows the human: task replies stay short; scene cues use in-character chat.
      </p>

      <label class="nexus-room-orch__label">
        Max total AI replies per auto burst
        <input
          class="nexus-room-orch__input"
          type="number"
          min="1"
          max="20"
          :value="maxAiOnlyChain"
          :disabled="busy || localBusy"
          @change="onMaxAiOnlyChain"
        />
      </label>

      <label class="nexus-room-orch__label">
        Max replies per agent (same burst)
        <input
          class="nexus-room-orch__input"
          type="number"
          min="1"
          max="20"
          :value="maxTurns"
          :disabled="busy || localBusy"
          @change="onMaxTurns"
        />
      </label>

      <label class="nexus-room-orch__check">
        <input
          type="checkbox"
          :checked="burstCreditsEnabled"
          :disabled="busy || localBusy"
          @change="onBurstCreditsToggle"
        />
        Limit auto-burst spend
      </label>
      <label v-if="burstCreditsEnabled" class="nexus-room-orch__label">
        Max credits per auto burst
        <input
          class="nexus-room-orch__input"
          type="number"
          min="1"
          max="1000000"
          :value="burstCreditsCents"
          :disabled="busy || localBusy"
          @change="onBurstCredits"
        />
      </label>

      <room-orchestration-rules-editor
        :rules="roomRules"
        :disabled="!canEdit"
        :busy="busy || localBusy"
        :on-save="saveRoomRules"
      />

      <div v-if="error" class="nexus-error">{{ error }}</div>
    </template>
  </section>
</template>

<script>
import RoomOrchestrationRulesEditor from './RoomOrchestrationRulesEditor.vue'

export default {
  name: 'RoomOrchestrationSection',
  components: { RoomOrchestrationRulesEditor },
  props: {
    detail: { type: Object, default: null },
    updateRoomOrchestration: { type: Function, default: null },
    busy: { type: Boolean, default: false },
  },
  data() {
    return {
      error: null,
      localBusy: false,
      burstCreditsEnabled: false,
      burstCreditsCents: 100,
    }
  },
  computed: {
    orchestration() {
      return (this.detail && this.detail.orchestration) || {}
    },
    aiCount() {
      const parts = (this.detail && this.detail.participants) || []
      return parts.filter((p) => p.type === 'agent' || p.type === 'virtual_agent').length
    },
    visible() {
      return this.aiCount > 0
    },
    canEdit() {
      return Boolean(this.detail && this.detail.viewerIsOwner && this.updateRoomOrchestration)
    },
    defaultMode() {
      return this.orchestration.defaultAiResponseMode || 'mention_only'
    },
    autoChatStyle() {
      return this.orchestration.autoChatStyle || 'mixed'
    },
    maxTurns() {
      return this.orchestration.maxAgentTurnsLimit || 5
    },
    maxAiOnlyChain() {
      return this.orchestration.maxAiOnlyChainLength || 8
    },
    roomRules() {
      return Array.isArray(this.orchestration.roomRules) ? this.orchestration.roomRules : []
    },
  },
  watch: {
    detail: {
      immediate: true,
      handler() {
        const cents = this.orchestration.maxAutoBurstCreditsCents
        if (typeof cents === 'number' && cents > 0) {
          this.burstCreditsEnabled = true
          this.burstCreditsCents = cents
        } else {
          this.burstCreditsEnabled = false
        }
      },
    },
  },
  methods: {
    async save(patch) {
      if (!this.updateRoomOrchestration || !this.detail) return
      this.error = null
      this.localBusy = true
      try {
        await this.updateRoomOrchestration({
          roomId: this.detail.id,
          ...patch,
        })
        this.$emit('updated')
      } catch (err) {
        this.error = (err && err.message) || 'Failed to update orchestration'
        throw err
      } finally {
        this.localBusy = false
      }
    },
    onDefaultMode(ev) {
      this.save({ defaultAiResponseMode: ev.target.value })
    },
    onAutoChatStyle(ev) {
      this.save({ autoChatStyle: ev.target.value })
    },
    onMaxTurns(ev) {
      const n = Number(ev.target.value)
      if (!Number.isFinite(n)) return
      this.save({ maxAgentTurnsLimit: Math.max(1, Math.min(20, Math.round(n))) })
    },
    onMaxAiOnlyChain(ev) {
      const n = Number(ev.target.value)
      if (!Number.isFinite(n)) return
      this.save({ maxAiOnlyChainLength: Math.max(1, Math.min(20, Math.round(n))) })
    },
    onBurstCreditsToggle(ev) {
      this.burstCreditsEnabled = Boolean(ev.target.checked)
      if (!this.burstCreditsEnabled) {
        this.save({ maxAutoBurstCreditsCents: null })
      } else {
        const n = Math.max(1, Math.round(Number(this.burstCreditsCents) || 100))
        this.burstCreditsCents = n
        this.save({ maxAutoBurstCreditsCents: n })
      }
    },
    onBurstCredits(ev) {
      const n = Number(ev.target.value)
      if (!Number.isFinite(n) || n <= 0) {
        this.burstCreditsEnabled = false
        this.save({ maxAutoBurstCreditsCents: null })
        return
      }
      const cents = Math.max(1, Math.min(1000000, Math.round(n)))
      this.burstCreditsCents = cents
      this.save({ maxAutoBurstCreditsCents: cents })
    },
    async saveRoomRules(rules) {
      await this.save({ roomRules: rules })
    },
  },
}
</script>

<style scoped>
.nexus-room-orch {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #e9ecef;
}
.nexus-room-orch__title {
  font-size: 11px;
  font-weight: 700;
  color: #66615b;
  margin-bottom: 6px;
}
.nexus-room-orch__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #6c757d;
  margin-bottom: 8px;
}
.nexus-room-orch__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6c757d;
  margin-bottom: 8px;
}
.nexus-room-orch__select,
.nexus-room-orch__input {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  color: #66615b;
  background: #fff;
}
.nexus-room-orch__hint {
  margin: -4px 0 8px;
}
.nexus-muted {
  font-size: 11px;
  color: #6c757d;
}
.nexus-error {
  font-size: 11px;
  color: #ef8157;
}
</style>
