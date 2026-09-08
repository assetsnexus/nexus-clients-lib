<template>
  <div v-if="active" class="nexus-active-phone-chip">
    <button
      type="button"
      class="nexus-chip-main"
      :class="paused ? 'is-paused' : 'is-live'"
      :title="expandTitle"
      @click="$emit('expand')"
    >
      <span class="nexus-dot" :class="{ 'nexus-dot--paused': paused }" />
      <span class="nexus-tabular">{{ formattedElapsed }}</span>
      <span v-if="label" class="nexus-chip-label">{{ label }}</span>
    </button>
    <button
      type="button"
      class="nexus-chip-action"
      :title="muted ? 'Unmute' : 'Mute'"
      @click.stop="$emit('toggle-mute')"
    >
      {{ muted ? 'Unmute' : 'Mute' }}
    </button>
    <button
      type="button"
      class="nexus-chip-action"
      :title="paused ? 'Resume' : 'Pause'"
      @click.stop="$emit('pause-resume')"
    >
      {{ paused ? 'Resume' : 'Pause' }}
    </button>
  </div>
</template>

<script>
import { formatCallDuration } from '../panel/labels';

export default {
  name: 'ActivePhoneChip',
  props: {
    status: { type: String, default: 'idle' },
    elapsedSec: { type: Number, default: 0 },
    muted: { type: Boolean, default: false },
    paused: { type: Boolean, default: false },
    label: { type: String, default: '' },
  },
  computed: {
    active() {
      return ['live', 'paused', 'connecting', 'ringing', 'waiting_inbound', 'active'].includes(
        this.status,
      );
    },
    formattedElapsed() {
      return formatCallDuration(this.elapsedSec);
    },
    expandTitle() {
      return 'Open voice call';
    },
  },
};
</script>

<style scoped>
.nexus-active-phone-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.nexus-chip-main {
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  border: 1px solid #28a745;
  background: #fff;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 13px;
}
.nexus-chip-main.is-paused {
  border-color: #ffc107;
}
.nexus-chip-action {
  border: 1px solid #ced4da;
  background: #fff;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.nexus-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #28a745;
  animation: nexus-pulse 1.2s infinite;
}
.nexus-dot--paused {
  background: #ffc107;
  animation: none;
}
.nexus-chip-label {
  max-width: 90px;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nexus-tabular {
  font-variant-numeric: tabular-nums;
}
@keyframes nexus-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
