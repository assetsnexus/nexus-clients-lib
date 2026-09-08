<template>
  <div
    v-if="visible && filteredCandidates.length"
    class="nexus-mention-autocomplete"
    :style="overlayStyle"
  >
    <ul class="nexus-mention-autocomplete__list">
      <li
        v-for="(candidate, idx) in filteredCandidates"
        :key="candidate.id"
        class="nexus-mention-autocomplete__item"
        :class="{ 'nexus-mention-autocomplete__item--active': idx === activeIndex }"
        @mousedown.prevent="selectCandidate(candidate)"
        @mouseenter="activeIndex = idx"
      >
        <span class="nexus-mention-autocomplete__name">{{ candidate.name }}</span>
        <span class="nexus-mention-autocomplete__type">{{ candidate.type }}</span>
      </li>
    </ul>
  </div>
</template>

<script>
/**
 * @mentions autocomplete overlay for the chat composer.
 * Shows a popup of contacts/agents when the user types `@` followed by a query.
 *
 * Usage:
 *   <mention-autocomplete
 *     :candidates="contacts"
 *     :textarea-ref="composerRef"
 *     @select="onMentionSelect"
 *   />
 *
 * The parent should pass all available contacts/agents as `candidates`.
 * When a candidate is selected, `@select` emits `{ id, name, token }` where
 * `token` is the `@[Name](id)` string to insert into the draft.
 */
export default {
  name: 'MentionAutocomplete',
  props: {
    candidates: { type: Array, default: () => [] },
    textareaRef: { type: [Object, HTMLElement], default: null },
    maxResults: { type: Number, default: 8 },
  },
  data() {
    return {
      visible: false,
      query: '',
      activeIndex: 0,
      overlayStyle: {},
      mentionStartIndex: -1,
    }
  },
  computed: {
    filteredCandidates() {
      if (!this.query) return this.candidates.slice(0, this.maxResults)
      const q = this.query.toLowerCase()
      return this.candidates
        .filter((c) => (c.name || '').toLowerCase().includes(q))
        .slice(0, this.maxResults)
    },
  },
  watch: {
    textareaRef(el) {
      this.bindTextarea(el)
    },
  },
  mounted() {
    if (this.textareaRef) this.bindTextarea(this.textareaRef)
  },
  beforeDestroy() {
    this.unbindTextarea()
  },
  methods: {
    bindTextarea(el) {
      this.unbindTextarea()
      const textarea = el?.$el || el
      if (!textarea || typeof textarea.addEventListener !== 'function') return
      this._textarea = textarea
      textarea.addEventListener('input', this.onInput)
      textarea.addEventListener('keydown', this.onKeydown)
      textarea.addEventListener('blur', this.onBlur)
    },
    unbindTextarea() {
      if (!this._textarea) return
      this._textarea.removeEventListener('input', this.onInput)
      this._textarea.removeEventListener('keydown', this.onKeydown)
      this._textarea.removeEventListener('blur', this.onBlur)
      this._textarea = null
    },
    onInput() {
      const textarea = this._textarea
      if (!textarea) return
      const value = textarea.value || ''
      const cursor = textarea.selectionStart || 0
      const before = value.slice(0, cursor)
      const atMatch = before.match(/@([^\s@]*)$/)
      if (atMatch) {
        this.query = atMatch[1]
        this.mentionStartIndex = cursor - atMatch[0].length
        this.activeIndex = 0
        this.visible = true
        this.positionOverlay(textarea)
      } else {
        this.visible = false
        this.mentionStartIndex = -1
      }
    },
    onKeydown(event) {
      if (!this.visible || !this.filteredCandidates.length) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.activeIndex = (this.activeIndex + 1) % this.filteredCandidates.length
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        this.activeIndex =
          (this.activeIndex - 1 + this.filteredCandidates.length) % this.filteredCandidates.length
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        const candidate = this.filteredCandidates[this.activeIndex]
        if (candidate) {
          event.preventDefault()
          this.selectCandidate(candidate)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        this.visible = false
      }
    },
    onBlur() {
      setTimeout(() => { this.visible = false }, 150)
    },
    selectCandidate(candidate) {
      const token = `@[${candidate.name}](${candidate.id})`
      this.visible = false
      this.$emit('select', {
        id: candidate.id,
        name: candidate.name,
        token,
        startIndex: this.mentionStartIndex,
      })
    },
    positionOverlay(textarea) {
      if (!textarea) return
      const rect = textarea.getBoundingClientRect()
      this.overlayStyle = {
        position: 'absolute',
        bottom: `${rect.height + 4}px`,
        left: '0px',
        minWidth: '200px',
        maxWidth: '320px',
        zIndex: 100,
      }
    },
  },
}
</script>

<style scoped>
.nexus-mention-autocomplete {
  background: #fff;
  border: 1px solid #ced4da;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.nexus-mention-autocomplete__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 200px;
  overflow-y: auto;
}
.nexus-mention-autocomplete__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
}
.nexus-mention-autocomplete__item--active {
  background: #e9ecef;
}
.nexus-mention-autocomplete__name {
  font-weight: 500;
}
.nexus-mention-autocomplete__type {
  font-size: 11px;
  color: #6c757d;
  margin-left: 8px;
}
</style>
