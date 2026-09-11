<template>
  <div
    class="nexus-speak-widget"
    :class="'nexus-speak-widget--' + phase"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <button
      type="button"
      class="nexus-speak-widget__main"
      :title="mainTitle"
      :disabled="!text"
      @click="onMainClick"
    >
      <span v-if="phase === 'processing' || phase === 'playing'" class="nexus-speak-widget__ring">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            opacity="0.25"
          />
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            class="nexus-speak-widget__arc"
            :class="{ 'is-playing': phase === 'playing' }"
          />
        </svg>
      </span>
      <span v-else class="nexus-speak-widget__icon" aria-hidden="true">{{ mainIcon }}</span>
      <span class="nexus-speak-widget__label">{{ mainLabel }}</span>
    </button>
    <button
      v-if="hovered && (phase === 'processing' || phase === 'playing')"
      type="button"
      class="nexus-speak-widget__side"
      :title="L.cancelSpeak"
      @click.stop="onCancel"
    >
      ✕
    </button>
    <button
      v-else-if="hovered && phase === 'done'"
      type="button"
      class="nexus-speak-widget__side"
      :title="L.playAgain"
      @click.stop="onReplay"
    >
      ↻
    </button>
    <div class="nexus-speak-widget__gear-wrap">
      <button
        type="button"
        class="nexus-speak-widget__side"
        :title="L.voiceSettings"
        @click.stop="onGear"
      >
        ⚙
      </button>
      <div v-if="settingsOpen" class="nexus-speak-widget__popover" @click.stop>
        <div class="nexus-speak-widget__popover-title">{{ L.replyVoice }}</div>
        <template v-if="canConfigureAgent">
          <p class="nexus-speak-widget__hint">
            {{ L.agentVoiceHint }}
          </p>
          <button type="button" class="nexus-btn nexus-btn--block" @click="openAgentConfig">
            {{ L.agentVoiceSettings }}
          </button>
        </template>
        <template v-else>
          <label class="nexus-speak-widget__field">
            <span>{{ L.model }}</span>
            <select v-model="draftModelId" class="nexus-speak-widget__select">
              <option v-for="m in ttsModels" :key="m.id" :value="m.id">
                {{ modelOptionLabel(m) }}
              </option>
            </select>
          </label>
          <label class="nexus-speak-widget__field">
            <span>{{ L.voicePreset }}</span>
            <input
              v-model="draftVoicePreset"
              type="text"
              class="nexus-speak-widget__input"
              :placeholder="L.optional"
            />
          </label>
          <div class="nexus-speak-widget__popover-actions">
            <button type="button" class="nexus-btn" :disabled="saving" @click="saveOverride">
              {{ saving ? L.saving : L.save }}
            </button>
            <button type="button" class="nexus-btn-link" :disabled="saving" @click="clearOverride">
              {{ L.reset }}
            </button>
          </div>
          <p v-if="settingsError" class="nexus-speak-widget__error">{{ settingsError }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import {
  createSpeakTurnController,
  listAudioModels,
  getContactTts,
  setContactTts,
  clearContactTts,
} from '@nexus/chat-core';
import { DEFAULT_PANEL_LABELS } from './labels';

export default {
  name: 'SpeakTurnWidget',
  props: {
    text: { type: String, default: '' },
    turnId: { type: String, default: null },
    commandClient: { type: Object, default: null },
    agentId: { type: String, default: null },
    virtualAgentId: { type: String, default: null },
    canConfigureAgent: { type: Boolean, default: false },
    /** When true, auto-start speak once for this turnId. */
    autoSpeak: { type: Boolean, default: false },
    fallbackModelId: { type: String, default: null },
    labels: { type: Object, default: null },
  },
  data() {
    return {
      phase: 'idle',
      errorMessage: null,
      hovered: false,
      settingsOpen: false,
      ttsModels: [],
      draftModelId: '',
      draftVoicePreset: '',
      saving: false,
      settingsError: null,
      controller: null,
      unsubscribe: null,
      autoSpokenTurnId: null,
    };
  },
  computed: {
    L() {
      return { ...DEFAULT_PANEL_LABELS, ...(this.labels || {}) };
    },
    mainLabel() {
      if (this.phase === 'processing') return '…';
      if (this.phase === 'playing') return '♪';
      if (this.phase === 'done') return '♪';
      if (this.phase === 'error') return '!';
      return this.L.speak;
    },
    mainIcon() {
      if (this.phase === 'done') return '♪';
      if (this.phase === 'error') return '!';
      return '▶';
    },
    mainTitle() {
      if (this.errorMessage) return this.errorMessage;
      if (this.phase === 'processing') return this.L.generatingVoice;
      if (this.phase === 'playing') return this.L.playing;
      if (this.phase === 'done') return this.L.playAgain;
      return this.L.speak;
    },
  },
  watch: {
    commandClient: {
      immediate: true,
      handler() {
        this.rebuildController();
      },
    },
    agentId() {
      this.rebuildController();
    },
    autoSpeak: {
      immediate: true,
      handler(val) {
        if (val) this.maybeAutoSpeak();
      },
    },
    turnId() {
      this.autoSpokenTurnId = null;
      if (this.autoSpeak) this.maybeAutoSpeak();
    },
    text() {
      if (this.autoSpeak) this.maybeAutoSpeak();
    },
  },
  beforeDestroy() {
    this.teardown();
  },
  beforeUnmount() {
    this.teardown();
  },
  methods: {
    teardown() {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      if (this.controller) {
        this.controller.dispose();
        this.controller = null;
      }
    },
    rebuildController() {
      this.teardown();
      if (!this.commandClient || typeof this.commandClient.send !== 'function') return;
      this.controller = createSpeakTurnController({
        client: this.commandClient,
        agentId: this.agentId,
        virtualAgentId: this.virtualAgentId,
        fallbackModelId: this.fallbackModelId,
      });
      this.unsubscribe = this.controller.subscribe((state) => {
        this.phase = state.phase;
        this.errorMessage = state.errorMessage;
      });
      if (this.autoSpeak) this.maybeAutoSpeak();
    },
    maybeAutoSpeak() {
      if (!this.autoSpeak || !this.controller || !this.text || !this.turnId) return;
      if (this.autoSpokenTurnId === this.turnId) return;
      if (this.phase === 'processing' || this.phase === 'playing') return;
      this.autoSpokenTurnId = this.turnId;
      void this.controller.speak(this.text);
    },
    onMainClick() {
      if (!this.controller) return;
      if (this.phase === 'done') {
        void this.controller.replay();
        return;
      }
      if (this.phase === 'processing' || this.phase === 'playing') return;
      void this.controller.speak(this.text, { forceRecreate: this.phase === 'error' });
    },
    onCancel() {
      if (this.controller) void this.controller.cancel();
    },
    onReplay() {
      if (this.controller) void this.controller.replay();
    },
    modelOptionLabel(m) {
      const name = (m && (m.displayName || m.id)) || '';
      const transport = m && m.modalityTransport;
      if (transport === 'tts_stream' || transport === 'stt_stream') {
        return `${name} (${this.L.transportStream})`;
      }
      if (transport === 'tts_batch' || transport === 'stt_batch') {
        return `${name} (${this.L.transportBatch})`;
      }
      return name;
    },
    async onGear() {
      if (this.canConfigureAgent) {
        this.settingsOpen = !this.settingsOpen;
        return;
      }
      this.settingsOpen = !this.settingsOpen;
      if (!this.settingsOpen || !this.commandClient) return;
      this.settingsError = null;
      try {
        this.ttsModels = await listAudioModels(this.commandClient, 'tts');
        const view = this.agentId
          ? await getContactTts(this.commandClient, {
              agentId: this.agentId,
              virtualAgentId: this.virtualAgentId,
            })
          : null;
        this.draftModelId =
          (view && view.effectiveTtsModelId) ||
          (this.ttsModels[0] && this.ttsModels[0].id) ||
          '';
        this.draftVoicePreset = (view && view.effectiveVoicePreset) || '';
      } catch (err) {
        this.settingsError = err instanceof Error ? err.message : String(err);
      }
    },
    openAgentConfig() {
      this.settingsOpen = false;
      this.$emit('open-agent-voice-config', {
        agentId: this.agentId,
        virtualAgentId: this.virtualAgentId,
      });
    },
    async saveOverride() {
      if (!this.commandClient || !this.agentId || !this.draftModelId) return;
      this.saving = true;
      this.settingsError = null;
      try {
        await setContactTts(this.commandClient, {
          agentId: this.agentId,
          ttsModelId: this.draftModelId,
          virtualAgentId: this.virtualAgentId,
        });
        this.settingsOpen = false;
        this.rebuildController();
      } catch (err) {
        this.settingsError = err instanceof Error ? err.message : String(err);
      } finally {
        this.saving = false;
      }
    },
    async clearOverride() {
      if (!this.commandClient || !this.agentId) return;
      this.saving = true;
      this.settingsError = null;
      try {
        await clearContactTts(this.commandClient, {
          agentId: this.agentId,
          virtualAgentId: this.virtualAgentId,
        });
        this.settingsOpen = false;
        this.rebuildController();
      } catch (err) {
        this.settingsError = err instanceof Error ? err.message : String(err);
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.nexus-speak-widget {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  position: relative;
  margin-left: 4px;
}
.nexus-speak-widget__main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.75;
}
.nexus-speak-widget__main:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.05);
}
.nexus-speak-widget__side {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.7;
  line-height: 1;
}
.nexus-speak-widget__side:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.06);
}
.nexus-speak-widget__ring {
  display: inline-flex;
  width: 14px;
  height: 14px;
}
.nexus-speak-widget__arc {
  stroke-dasharray: 28;
  stroke-dashoffset: 18;
  transform-origin: 7px 7px;
  animation: nexus-speak-spin 0.9s linear infinite;
}
.nexus-speak-widget__arc.is-playing {
  stroke-dashoffset: 8;
  animation: nexus-speak-pulse 1.1s ease-in-out infinite;
}
@keyframes nexus-speak-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes nexus-speak-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
.nexus-speak-widget__gear-wrap {
  position: relative;
}
.nexus-speak-widget__popover {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 20;
  min-width: 200px;
  max-width: 260px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  color: #66615b;
}
.nexus-speak-widget__popover-title {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 6px;
}
.nexus-speak-widget__hint {
  font-size: 11px;
  margin: 0 0 8px;
  opacity: 0.85;
}
.nexus-speak-widget__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  margin-bottom: 8px;
}
.nexus-speak-widget__select,
.nexus-speak-widget__input {
  font: inherit;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #e9ecef;
  border-radius: 4px;
}
.nexus-speak-widget__popover-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nexus-speak-widget__error {
  color: #ef8157;
  font-size: 11px;
  margin: 6px 0 0;
}
.nexus-btn--block {
  width: 100%;
}
</style>
