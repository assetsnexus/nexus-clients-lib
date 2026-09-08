<template>
  <div class="nexus-room-rules">
    <div class="nexus-room-rules__head">
      <div>
        <div class="nexus-room-rules__title">Group rules for AI agents</div>
        <p class="nexus-muted">
          Applied to every AI participant as system instructions.
        </p>
      </div>
      <span class="nexus-muted">{{ normalizedCount }}/{{ MAX_RULES }}</span>
    </div>

    <div
      v-for="(rule, index) in draft"
      :key="'rule-' + index"
      class="nexus-room-rules__row"
    >
      <div class="nexus-room-rules__row-head">
        <span>Rule {{ index + 1 }}</span>
        <button
          type="button"
          class="nexus-btn nexus-btn--xs"
          :disabled="disabled || busy"
          @click="removeRule(index)"
        >
          Remove
        </button>
      </div>
      <textarea
        class="nexus-room-rules__textarea"
        rows="3"
        :value="rule"
        :disabled="disabled || busy"
        placeholder="e.g. Always summarize decisions in bullet points."
        @input="updateRule(index, $event.target.value)"
      />
      <div v-if="rule.trim().length > MAX_RULE_LENGTH" class="nexus-error">
        Max {{ MAX_RULE_LENGTH }} characters ({{ rule.trim().length }}).
      </div>
    </div>

    <div class="nexus-room-rules__actions">
      <button
        type="button"
        class="nexus-btn nexus-btn--sm"
        :disabled="disabled || busy || draft.length >= MAX_RULES"
        @click="addRule"
      >
        Add rule
      </button>
      <button
        type="button"
        class="nexus-btn nexus-btn--sm nexus-btn--primary"
        :disabled="disabled || busy || !dirty"
        @click="save"
      >
        Save rules
      </button>
    </div>
    <div v-if="error" class="nexus-error">{{ error }}</div>
  </div>
</template>

<script>
import {
  MAX_ROOM_ORCHESTRATION_RULES,
  MAX_ROOM_ORCHESTRATION_RULE_LENGTH,
  normalizeRoomOrchestrationRules,
  validateRoomOrchestrationRules,
} from './room-orchestration-rules.util.js'

export default {
  name: 'RoomOrchestrationRulesEditor',
  props: {
    rules: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    onSave: { type: Function, required: true },
  },
  data() {
    return {
      MAX_RULES: MAX_ROOM_ORCHESTRATION_RULES,
      MAX_RULE_LENGTH: MAX_ROOM_ORCHESTRATION_RULE_LENGTH,
      draft: [],
      dirty: false,
      error: null,
    }
  },
  computed: {
    normalizedCount() {
      return normalizeRoomOrchestrationRules(this.draft).length
    },
  },
  watch: {
    rules: {
      immediate: true,
      handler(next) {
        const rows = Array.isArray(next) ? next.slice() : []
        this.draft = rows.length ? rows : ['']
        this.dirty = false
        this.error = null
      },
    },
  },
  methods: {
    updateRule(index, value) {
      this.draft = this.draft.map((row, i) => (i === index ? value : row))
      this.dirty = true
    },
    addRule() {
      if (this.draft.length >= MAX_ROOM_ORCHESTRATION_RULES) {
        this.error = `Maximum ${MAX_ROOM_ORCHESTRATION_RULES} rules.`
        return
      }
      this.draft = [...this.draft, '']
      this.dirty = true
      this.error = null
    },
    removeRule(index) {
      const next = this.draft.filter((_, i) => i !== index)
      this.draft = next.length ? next : ['']
      this.dirty = true
    },
    async save() {
      this.error = null
      const validated = validateRoomOrchestrationRules(this.draft)
      if (!validated.ok) {
        this.error = validated.error
        return
      }
      try {
        await this.onSave(validated.rules)
        this.draft = validated.rules.length ? validated.rules.slice() : ['']
        this.dirty = false
      } catch (err) {
        this.error = (err && err.message) || 'Failed to save room rules'
      }
    },
  },
}
</script>

<style scoped>
.nexus-room-rules {
  margin-top: 8px;
}
.nexus-room-rules__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.nexus-room-rules__title {
  font-size: 11px;
  font-weight: 700;
  color: #66615b;
}
.nexus-room-rules__row {
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 6px;
  margin-bottom: 6px;
  background: #fafafa;
}
.nexus-room-rules__row-head {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #6c757d;
  margin-bottom: 4px;
}
.nexus-room-rules__textarea {
  width: 100%;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  resize: vertical;
}
.nexus-room-rules__actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.nexus-muted {
  font-size: 11px;
  color: #6c757d;
}
.nexus-error {
  font-size: 11px;
  color: #ef8157;
  margin-top: 4px;
}
.nexus-btn--primary {
  background: #51cbce;
  border-color: #51cbce;
  color: #fff;
}
</style>
