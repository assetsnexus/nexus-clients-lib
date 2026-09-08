<template>
  <div
    v-if="visible"
    class="nexus-realtime-call-panel"
    :class="{ 'nexus-realtime-call-panel--minimized': minimized }"
    role="dialog"
    aria-label="Realtime voice call"
  >
    <div v-if="!minimized" class="nexus-realtime-call-panel__card">
      <div class="nexus-realtime-call-panel__header">
        <div>
          <div class="nexus-realtime-call-panel__title">{{ titleLabel }}</div>
          <div class="nexus-realtime-call-panel__subtitle">{{ subtitleLabel }}</div>
        </div>
        <button type="button" class="nexus-btn-link" :title="minimizeLabel" @click="$emit('minimize')">
          ▾
        </button>
      </div>

      <div class="nexus-realtime-call-panel__status">
        <span class="nexus-dot" :class="'nexus-dot--' + (surface.status || 'idle')" />
        <span>{{ statusLabel }}</span>
        <span v-if="showTimer" class="nexus-tabular">{{ formattedElapsed }}</span>
      </div>

      <p v-if="surface.errorMessage" class="nexus-realtime-call-panel__error">{{ surface.errorMessage }}</p>

      <div class="nexus-realtime-call-panel__actions">
        <button
          v-if="controlsVisible"
          type="button"
          class="nexus-btn"
          :aria-pressed="!!surface.muted"
          @click="$emit('toggle-mute')"
        >
          {{ surface.muted ? unmuteLabel : muteLabel }}
        </button>
        <button
          v-if="surface.status === 'live' || surface.status === 'paused'"
          type="button"
          class="nexus-btn"
          @click="$emit('pause-resume')"
        >
          {{ surface.status === 'paused' ? resumeLabel : pauseLabel }}
        </button>
        <button
          v-if="controlsVisible"
          type="button"
          class="nexus-btn nexus-btn--danger"
          @click="$emit('end')"
        >
          {{ endLabel }}
        </button>
        <button
          v-if="surface.status === 'error'"
          type="button"
          class="nexus-btn nexus-btn--primary"
          @click="$emit('retry')"
        >
          {{ retryLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { formatCallDuration } from '../panel/labels';

export default {
  name: 'RealtimeCallPanel',
  props: {
    surface: {
      type: Object,
      default: () => ({
        status: 'idle',
        elapsedSec: 0,
        muted: false,
        paused: false,
        errorMessage: null,
      }),
    },
    minimized: { type: Boolean, default: false },
    mode: { type: String, default: 'browser' },
  },
  computed: {
    visible() {
      const status = this.surface && this.surface.status;
      return status && status !== 'idle' && status !== 'ended';
    },
    controlsVisible() {
      const status = this.surface && this.surface.status;
      return status === 'live' || status === 'paused' || status === 'connecting';
    },
    showTimer() {
      const status = this.surface && this.surface.status;
      return status === 'live' || status === 'paused';
    },
    formattedElapsed() {
      return formatCallDuration(this.surface && this.surface.elapsedSec);
    },
    titleLabel() {
      return 'Voice call';
    },
    subtitleLabel() {
      if (this.mode === 'outbound') return 'Outbound phone · saved to chat';
      if (this.mode === 'inbound') return 'Dial-in · waiting / live';
      return 'Browser realtime · saved to chat';
    },
    statusLabel() {
      const status = this.surface && this.surface.status;
      if (status === 'connecting') return 'Connecting…';
      if (status === 'paused') return 'Paused';
      if (status === 'live' || status === 'active') return 'On call';
      if (status === 'ringing') return 'Ringing…';
      if (status === 'waiting_inbound') return 'Waiting for dial-in';
      if (status === 'error') return 'Call failed';
      return 'Starting…';
    },
    muteLabel() {
      return 'Mute';
    },
    unmuteLabel() {
      return 'Unmute';
    },
    pauseLabel() {
      return 'Pause';
    },
    resumeLabel() {
      return 'Resume';
    },
    endLabel() {
      return 'End call';
    },
    retryLabel() {
      return 'Retry';
    },
    minimizeLabel() {
      return 'Minimize';
    },
  },
};
</script>

<style scoped>
.nexus-realtime-call-panel {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  pointer-events: none;
}
.nexus-realtime-call-panel--minimized {
  display: none;
}
.nexus-realtime-call-panel__card {
  pointer-events: auto;
  width: calc(100% - 16px);
  margin: 0 8px 8px;
  border: 1px solid rgba(40, 167, 69, 0.45);
  border-radius: 12px 12px 0 0;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
  padding: 14px 16px;
}
.nexus-realtime-call-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.nexus-realtime-call-panel__title {
  font-weight: 700;
  color: #28a745;
}
.nexus-realtime-call-panel__subtitle {
  font-size: 12px;
  color: #6c757d;
}
.nexus-realtime-call-panel__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(40, 167, 69, 0.35);
  background: rgba(40, 167, 69, 0.08);
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}
.nexus-realtime-call-panel__error {
  color: #dc3545;
  font-size: 12px;
}
.nexus-realtime-call-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.nexus-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #adb5bd;
}
.nexus-dot--live,
.nexus-dot--active {
  background: #28a745;
  animation: nexus-pulse 1.2s infinite;
}
.nexus-dot--paused,
.nexus-dot--ringing,
.nexus-dot--waiting_inbound {
  background: #ffc107;
}
.nexus-dot--connecting {
  background: #17a2b8;
}
.nexus-dot--error {
  background: #dc3545;
}
.nexus-tabular {
  font-variant-numeric: tabular-nums;
}
.nexus-btn {
  border: 1px solid #ced4da;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
}
.nexus-btn--danger {
  border-color: #dc3545;
  color: #dc3545;
}
.nexus-btn--primary {
  border-color: #51cbce;
  background: #51cbce;
  color: #fff;
}
.nexus-btn-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}
@keyframes nexus-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
