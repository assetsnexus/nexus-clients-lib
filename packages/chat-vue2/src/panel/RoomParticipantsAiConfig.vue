<template>
  <div v-if="aiParticipants.length" class="nexus-room-ai-cfg">
    <div class="nexus-room-ai-cfg__title">Per-agent AI config</div>
    <div
      v-for="p in aiParticipants"
      :key="p.type + ':' + p.id"
      class="nexus-room-ai-cfg__card"
    >
      <div class="nexus-room-ai-cfg__name">
        {{ p.displayName || p.username || p.id }}
        <span class="nexus-badge-sm">{{ p.type }}</span>
      </div>

      <label class="nexus-room-ai-cfg__label">
        Model
        <select
          class="nexus-room-ai-cfg__select"
          :value="modelValue(p)"
          :disabled="!canEdit || busy"
          @change="onModel(p, $event.target.value)"
        >
          <option value="">Use agent default model</option>
          <option
            v-for="m in models"
            :key="m.id || m.modelRef"
            :value="m.id || m.modelRef"
          >
            {{ m.label || m.name || m.id || m.modelRef }}
          </option>
        </select>
      </label>

      <label class="nexus-room-ai-cfg__label">
        Response mode
        <select
          class="nexus-room-ai-cfg__select"
          :value="responseModeSelect(p)"
          :disabled="!canEdit || busy"
          @change="onResponseMode(p, $event.target.value)"
        >
          <option value="inherit">Inherit ({{ roomDefaultLabel }})</option>
          <option value="mention_only">@mention only</option>
          <option value="always">Always respond</option>
        </select>
      </label>

      <label class="nexus-room-ai-cfg__check">
        <input
          type="checkbox"
          :checked="Boolean(p.aiConfig && p.aiConfig.compactBeforeReply)"
          :disabled="!canEdit || busy"
          @change="onCompact(p, $event.target.checked)"
        />
        Compact context before reply
      </label>
      <div v-if="rowError[p.id]" class="nexus-error">{{ rowError[p.id] }}</div>
    </div>
  </div>
</template>

<script>
import {
  participantResponseModeFromSelect,
  participantResponseModeSelectValue,
} from './room-participants-ai-config.util.js'

export default {
  name: 'RoomParticipantsAiConfig',
  props: {
    detail: { type: Object, default: null },
    models: { type: Array, default: () => [] },
    upsertAiParticipantFn: { type: Function, default: null },
    busy: { type: Boolean, default: false },
  },
  data() {
    return { rowError: {} }
  },
  computed: {
    aiParticipants() {
      const parts = (this.detail && this.detail.participants) || []
      return parts.filter((p) => p.type === 'agent' || p.type === 'virtual_agent')
    },
    canEdit() {
      return Boolean(this.detail && this.detail.viewerIsOwner && this.upsertAiParticipantFn)
    },
    roomDefaultLabel() {
      const mode =
        (this.detail &&
          this.detail.orchestration &&
          this.detail.orchestration.defaultAiResponseMode) ||
        'mention_only'
      return mode === 'always' ? 'always' : '@mention only'
    },
  },
  methods: {
    modelValue(p) {
      return (p.aiConfig && p.aiConfig.modelId) || ''
    },
    responseModeSelect(p) {
      return participantResponseModeSelectValue(p.aiConfig && p.aiConfig.responseMode)
    },
    async save(p, patch) {
      if (!this.upsertAiParticipantFn || !this.detail) return
      this.rowError = { ...this.rowError, [p.id]: null }
      try {
        await this.upsertAiParticipantFn({
          roomId: this.detail.id,
          participantType: p.type,
          participantId: p.id,
          ...patch,
        })
        this.$emit('updated')
      } catch (err) {
        const msg = (err && err.message) || 'Failed to update AI participant'
        this.rowError = { ...this.rowError, [p.id]: msg }
      }
    },
    onModel(p, value) {
      this.save(p, { modelId: value ? value : null })
    },
    onResponseMode(p, value) {
      this.save(p, { responseMode: participantResponseModeFromSelect(value) })
    },
    onCompact(p, checked) {
      this.save(p, { compactBeforeReply: Boolean(checked) })
    },
  },
}
</script>

<style scoped>
.nexus-room-ai-cfg {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #e9ecef;
}
.nexus-room-ai-cfg__title {
  font-size: 11px;
  font-weight: 700;
  color: #66615b;
  margin-bottom: 6px;
}
.nexus-room-ai-cfg__card {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: #fff;
}
.nexus-room-ai-cfg__name {
  font-size: 12px;
  font-weight: 600;
  color: #66615b;
  margin-bottom: 6px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.nexus-room-ai-cfg__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #6c757d;
  margin-bottom: 8px;
}
.nexus-room-ai-cfg__select {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  background: #fff;
}
.nexus-room-ai-cfg__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6c757d;
}
.nexus-badge-sm {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: #eef2f7;
  color: #6c757d;
}
.nexus-error {
  font-size: 11px;
  color: #ef8157;
  margin-top: 4px;
}
</style>
