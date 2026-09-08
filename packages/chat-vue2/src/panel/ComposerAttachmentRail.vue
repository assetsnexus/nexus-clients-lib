<template>
  <div v-if="visible" class="nexus-composer-attachments" role="list" aria-label="Attachments">
    <div
      v-for="item in items"
      :key="item.localId"
      class="nexus-composer-att"
      :class="'nexus-composer-att--' + item.status"
      role="listitem"
    >
      <div class="nexus-composer-att__thumb" aria-hidden="true">
        <img v-if="item.previewUrl" :src="item.previewUrl" alt="" />
        <span v-else class="nexus-composer-att__icon">{{ iconFor(item) }}</span>
      </div>
      <div class="nexus-composer-att__body">
        <div class="nexus-composer-att__name" :title="item.filename">{{ item.filename }}</div>
        <div class="nexus-composer-att__meta">
          <span v-if="item.destLabel" class="nexus-composer-att__badge">{{ item.destLabel }}</span>
          <span v-if="item.status === 'uploading' || item.status === 'queued'">
            {{ progressLabel(item) }}
          </span>
          <span v-else-if="item.status === 'error'" class="nexus-composer-att__error">
            {{ item.error || labels.uploadFailed }}
          </span>
          <span v-else-if="item.status === 'ready'">{{ sizeLabel(item) }}</span>
        </div>
        <div
          v-if="item.status === 'uploading' || item.status === 'queued'"
          class="nexus-composer-att__bar"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="item.status === 'uploading' ? item.progress : 0"
        >
          <div
            class="nexus-composer-att__bar-fill"
            :class="{ 'nexus-composer-att__bar-fill--indeterminate': item.status === 'queued' || item.progress < 1 }"
            :style="barStyle(item)"
          />
        </div>
      </div>
      <div class="nexus-composer-att__actions">
        <button
          v-if="item.status === 'error'"
          type="button"
          class="nexus-composer-att__btn"
          :title="labels.retryUpload"
          @click.stop="$emit('retry', item.localId)"
        >
          ↻
        </button>
        <button
          type="button"
          class="nexus-composer-att__btn nexus-composer-att__btn--remove"
          :title="item.status === 'uploading' ? labels.cancelUpload : labels.removeAttachment"
          :aria-label="item.status === 'uploading' ? labels.cancelUpload : labels.removeAttachment"
          @click.stop="$emit('remove', item.localId)"
        >
          ×
        </button>
      </div>
    </div>
    <button
      v-if="canAddMore"
      type="button"
      class="nexus-composer-att-add"
      :title="labels.addMore"
      :aria-label="labels.addMore"
      @click="$emit('add-more')"
    >
      <span class="nexus-composer-att-add__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span class="nexus-composer-att-add__label">{{ labels.addMore }}</span>
    </button>
  </div>
</template>

<script>
export default {
  name: 'ComposerAttachmentRail',
  props: {
    items: { type: Array, default: () => [] },
    canAddMore: { type: Boolean, default: true },
    labels: { type: Object, default: () => ({}) },
  },
  computed: {
    visible() {
      return Array.isArray(this.items) && this.items.length > 0;
    },
  },
  methods: {
    iconFor(item) {
      const mime = String((item && item.mimeType) || '');
      if (mime.startsWith('image/')) return '🖼';
      if (mime.startsWith('audio/')) return '♫';
      if (mime.startsWith('video/')) return '▶';
      if (mime === 'application/pdf') return 'PDF';
      return '📄';
    },
    progressLabel(item) {
      if (item.status === 'queued') return this.labels.queued || 'Waiting…';
      const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
      if (pct < 1) return this.labels.uploading || 'Uploading…';
      return `${pct}%`;
    },
    sizeLabel(item) {
      const n = Number(item.sizeBytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },
    barStyle(item) {
      const pct = item.status === 'queued' ? 8 : Math.max(8, Math.min(100, Number(item.progress) || 8));
      return { width: `${pct}%` };
    },
  },
};
</script>

<style scoped>
.nexus-composer-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 8px;
}
.nexus-composer-att {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 220px;
  max-width: 100%;
  padding: 6px 8px;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #f8f9fa;
  box-sizing: border-box;
}
.nexus-composer-att--error {
  border-color: #f5c6cb;
  background: #f8d7da;
}
.nexus-composer-att--ready {
  background: #fff;
}
.nexus-composer-att-add {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;
  min-height: 72px;
  padding: 8px 6px;
  border: 1px dashed #ced4da;
  border-radius: 8px;
  background: #fff;
  color: #6c757d;
  cursor: pointer;
  font: inherit;
  box-sizing: border-box;
}
.nexus-composer-att-add:hover,
.nexus-composer-att-add:focus {
  border-color: #51cbce;
  background: #f4fcfc;
  color: #2c8a8d;
  outline: none;
}
.nexus-composer-att-add__icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #eef7f7;
  color: #51cbce;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.nexus-composer-att-add:hover .nexus-composer-att-add__icon,
.nexus-composer-att-add:focus .nexus-composer-att-add__icon {
  background: #d7f1f2;
}
.nexus-composer-att-add__label {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}
.nexus-composer-att__thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  background: #e9ecef;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nexus-composer-att__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.nexus-composer-att__icon {
  font-size: 11px;
  font-weight: 700;
  color: #6c757d;
}
.nexus-composer-att__body {
  min-width: 0;
  flex: 1;
}
.nexus-composer-att__name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nexus-composer-att__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 10px;
  color: #6c757d;
  margin-top: 2px;
}
.nexus-composer-att__badge {
  background: #e9ecef;
  border-radius: 4px;
  padding: 0 4px;
}
.nexus-composer-att__error {
  color: #721c24;
}
.nexus-composer-att__bar {
  height: 4px;
  margin-top: 6px;
  background: #dee2e6;
  border-radius: 999px;
  overflow: hidden;
}
.nexus-composer-att__bar-fill {
  height: 100%;
  background: #51cbce;
  border-radius: 999px;
  transition: width 0.15s ease-out;
}
.nexus-composer-att__bar-fill--indeterminate {
  animation: nexus-att-pulse 1.1s ease-in-out infinite;
}
.nexus-composer-att__actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.nexus-composer-att__btn {
  border: 0;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
}
.nexus-composer-att__btn--remove:hover {
  color: #dc3545;
}
@keyframes nexus-att-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
</style>
