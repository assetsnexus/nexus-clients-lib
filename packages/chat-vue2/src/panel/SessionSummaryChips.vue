<template>
  <div v-if="hasSummary" class="session-summary-chips">
    <div v-if="topicChips.length" class="session-summary-chips__section">
      <span class="session-summary-chips__label">Topics</span>
      <div class="session-summary-chips__list">
        <span
          v-for="topic in topicChips"
          :key="topic.label"
          class="session-summary-chip session-summary-chip--topic"
          :title="topicTooltip(topic)"
        >
          {{ topic.label }}
          <span v-if="topic.salience != null" class="session-summary-chip__salience">
            {{ formatSalience(topic.salience) }}
          </span>
        </span>
      </div>
    </div>
    <div v-if="todoChips.length" class="session-summary-chips__section">
      <span class="session-summary-chips__label">Todos</span>
      <div class="session-summary-chips__list">
        <span
          v-for="(todo, idx) in todoChips"
          :key="idx"
          class="session-summary-chip"
          :class="todoStatusClass(todo.status)"
          :title="todoTooltip(todo)"
        >
          <span class="session-summary-chip__status-icon">{{ todoStatusIcon(todo.status) }}</span>
          {{ todo.text }}
          <span v-if="todo.dueAt" class="session-summary-chip__due">
            {{ formatDue(todo.dueAt) }}
          </span>
        </span>
      </div>
    </div>
    <div v-if="updatedAt" class="session-summary-chips__updated">
      Updated {{ formatRelative(updatedAt) }}
    </div>
  </div>
  <div v-else-if="loading" class="session-summary-chips session-summary-chips--loading">
    <span class="nexus-spin">↻</span> Loading summary…
  </div>
</template>

<script>
export default {
  name: 'SessionSummaryChips',
  props: {
    conversationId: { type: String, default: null },
    /** Provide either getSummary function or a pre-loaded summary object. */
    getSummary: { type: Function, default: null },
    summary: { type: Object, default: null },
  },
  data() {
    return {
      loaded: null,
      loading: false,
      error: null,
    };
  },
  computed: {
    resolved() {
      return this.summary || this.loaded;
    },
    structuredSummary() {
      return this.resolved?.structuredSummary ?? null;
    },
    hasSummary() {
      const s = this.structuredSummary;
      return s && ((s.topics && s.topics.length) || (s.todos && s.todos.length));
    },
    topicChips() {
      return (this.structuredSummary?.topics ?? []).slice(0, 20);
    },
    todoChips() {
      return (this.structuredSummary?.todos ?? []).slice(0, 20);
    },
    updatedAt() {
      return this.structuredSummary?.updatedAt ?? null;
    },
  },
  watch: {
    conversationId: {
      immediate: true,
      handler(id) {
        if (id && this.getSummary && !this.summary) {
          this.fetchSummary(id);
        }
      },
    },
  },
  methods: {
    async fetchSummary(convId) {
      if (!this.getSummary || !convId) return;
      this.loading = true;
      this.error = null;
      try {
        this.loaded = await this.getSummary(convId);
      } catch (err) {
        this.error = err;
        this.loaded = null;
      } finally {
        this.loading = false;
      }
    },
    formatSalience(val) {
      if (val == null) return '';
      return Math.round(val * 100) + '%';
    },
    topicTooltip(topic) {
      const parts = [topic.label];
      if (topic.salience != null) parts.push('Salience: ' + this.formatSalience(topic.salience));
      if (topic.firstSeenAt) parts.push('First: ' + new Date(topic.firstSeenAt).toLocaleString());
      if (topic.lastSeenAt) parts.push('Last: ' + new Date(topic.lastSeenAt).toLocaleString());
      return parts.join('\n');
    },
    todoStatusIcon(status) {
      if (status === 'done') return '✓';
      if (status === 'dropped') return '✗';
      return '○';
    },
    todoStatusClass(status) {
      if (status === 'done') return 'session-summary-chip--done';
      if (status === 'dropped') return 'session-summary-chip--dropped';
      return 'session-summary-chip--open';
    },
    todoTooltip(todo) {
      const parts = [todo.text, 'Status: ' + todo.status];
      if (todo.dueAt) parts.push('Due: ' + new Date(todo.dueAt).toLocaleString());
      return parts.join('\n');
    },
    formatDue(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '';
      const now = Date.now();
      const diff = d.getTime() - now;
      if (diff < 0) return 'overdue';
      if (diff < 86400000) return 'today';
      const days = Math.ceil(diff / 86400000);
      return days + 'd';
    },
    formatRelative(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '';
      const diff = Date.now() - d.getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      return Math.floor(diff / 86400000) + 'd ago';
    },
  },
};
</script>

<style scoped>
.session-summary-chips {
  padding: 6px 8px;
  border-bottom: 1px solid #e9ecef;
  font-size: 12px;
}
.session-summary-chips--loading {
  color: #6c757d;
}
.session-summary-chips__section {
  margin-bottom: 4px;
}
.session-summary-chips__label {
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  color: #6c757d;
  margin-right: 4px;
}
.session-summary-chips__list {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 2px;
}
.session-summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 11px;
  line-height: 1.5;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-summary-chip--topic {
  background: #e8f4fd;
  border-color: #b8daff;
  color: #004085;
}
.session-summary-chip--open {
  background: #fff3cd;
  border-color: #ffeeba;
  color: #856404;
}
.session-summary-chip--done {
  background: #d4edda;
  border-color: #c3e6cb;
  color: #155724;
  text-decoration: line-through;
}
.session-summary-chip--dropped {
  background: #f5f5f5;
  border-color: #dee2e6;
  color: #6c757d;
  text-decoration: line-through;
}
.session-summary-chip__salience {
  font-size: 9px;
  opacity: 0.7;
}
.session-summary-chip__status-icon {
  font-size: 10px;
}
.session-summary-chip__due {
  font-size: 9px;
  opacity: 0.7;
  margin-left: 2px;
}
.session-summary-chips__updated {
  margin-top: 4px;
  color: #adb5bd;
  font-size: 10px;
}
.nexus-spin {
  display: inline-block;
  animation: nexus-spin 1s linear infinite;
}
@keyframes nexus-spin {
  to { transform: rotate(360deg); }
}
</style>
