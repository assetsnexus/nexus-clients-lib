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
            <select
              v-model="draftVoicePreset"
              class="nexus-speak-widget__select"
              :disabled="voicesLoading"
            >
              <option value="">{{ L.optional || '—' }}</option>
              <option v-for="v in voiceOptions" :key="v.id" :value="v.id">
                {{ v.title }}
              </option>
              <option v-if="allowCustomVoice" value="__custom__">Custom…</option>
            </select>
          </label>
          <label
            v-if="draftVoicePreset === '__custom__' || showCustomVoiceInput"
            class="nexus-speak-widget__field"
          >
            <span>{{ L.voicePreset }} (custom)</span>
            <input
              v-model="customVoicePreset"
              type="text"
              class="nexus-speak-widget__input"
              :placeholder="L.optional"
            />
          </label>
        </template>
        <div v-if="canSetVoiceSample" class="nexus-speak-widget__sample">
          <div class="nexus-speak-widget__field">
            <span>{{ L.customVoiceSample }}</span>
            <p class="nexus-speak-widget__hint">{{ L.customVoiceSampleHint }}</p>
            <input
              ref="sampleFile"
              type="file"
              accept="audio/wav,audio/x-wav,audio/wave,.wav,audio/mpeg,audio/mp3"
              class="nexus-speak-widget__file"
              @change="onSampleFilePicked"
            />
            <p v-if="sampleLabel" class="nexus-speak-widget__sample-label">{{ sampleLabel }}</p>
            <label class="nexus-speak-widget__field">
              <span>{{ L.sampleTranscript }}</span>
              <input
                v-model="draftSampleTranscript"
                type="text"
                class="nexus-speak-widget__input"
                :placeholder="L.optional"
              />
            </label>
            <button
              v-if="hasVoiceSample || pendingSampleFile"
              type="button"
              class="nexus-btn-link"
              :disabled="saving || uploadingSample"
              @click="clearSampleDraft"
            >
              {{ L.clearVoiceSample }}
            </button>
          </div>
        </div>
        <div class="nexus-speak-widget__popover-actions">
          <button
            type="button"
            class="nexus-btn"
            :disabled="saving || uploadingSample || (!canConfigureAgent && !draftModelId)"
            @click="saveOverride"
          >
            {{ saving || uploadingSample ? L.saving : L.save }}
          </button>
          <button
            v-if="!canConfigureAgent"
            type="button"
            class="nexus-btn-link"
            :disabled="saving"
            @click="clearOverride"
          >
            {{ L.reset }}
          </button>
        </div>
        <p v-if="settingsError" class="nexus-speak-widget__error">{{ settingsError }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import {
  createSpeakTurnController,
  listAudioModels,
  listTtsVoices,
  ttsVoicesForPicker,
  getContactTts,
  setContactTts,
  clearContactTts,
  contactTtsNeedsSetup,
  uploadAttachment,
} from '@nexus/chat-core';
import { DEFAULT_PANEL_LABELS } from './labels';

const VOICE_SAMPLE_MAX_BYTES = 1 * 1024 * 1024;

export default {
  name: 'SpeakTurnWidget',
  props: {
    text: { type: String, default: '' },
    turnId: { type: String, default: null },
    commandClient: { type: Object, default: null },
    agentId: { type: String, default: null },
    virtualAgentId: { type: String, default: null },
    canConfigureAgent: { type: Boolean, default: false },
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
      customVoicePreset: '',
      voiceOptions: [],
      voicesLoading: false,
      allowCustomVoice: true,
      saving: false,
      settingsError: null,
      controller: null,
      unsubscribe: null,
      autoSpokenTurnId: null,
      hasVoiceSample: false,
      sampleLabel: '',
      draftSampleTranscript: '',
      pendingSampleFile: null,
      clearSampleOnSave: false,
      uploadingSample: false,
      canSetVoiceSample: true,
    };
  },
  computed: {
    L() {
      return { ...DEFAULT_PANEL_LABELS, ...(this.labels || {}) };
    },
    showCustomVoiceInput() {
      const id = this.draftVoicePreset;
      if (!id || id === '__custom__') return id === '__custom__';
      return !this.voiceOptions.some((v) => v.id === id);
    },
    mainLabel() {
      if (this.phase === 'processing') return '…';
      if (this.phase === 'playing') return '♪';
      if (this.phase === 'done') return '♪';
      if (this.phase === 'error' || this.phase === 'needs_setup') return '!';
      return this.L.speak;
    },
    mainIcon() {
      if (this.phase === 'done') return '♪';
      if (this.phase === 'error' || this.phase === 'needs_setup') return '!';
      return '▶';
    },
    mainTitle() {
      if (this.errorMessage) return this.errorMessage;
      if (this.phase === 'processing') return this.L.generatingVoice;
      if (this.phase === 'playing') return this.L.playing;
      if (this.phase === 'done') return this.L.playAgain;
      if (this.phase === 'needs_setup') return this.L.voiceSettings;
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
    draftModelId(val) {
      if (this.settingsOpen && val && !this.canConfigureAgent) void this.refreshVoices(val);
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
        if (state.phase === 'needs_setup') {
          void this.openSettings();
        }
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
    async onMainClick() {
      if (!this.controller) return;
      if (this.phase === 'done') {
        void this.controller.replay();
        return;
      }
      if (this.phase === 'processing' || this.phase === 'playing') return;
      if (await this.ensureTtsConfiguredOrOpenSetup()) {
        void this.controller.speak(this.text, { forceRecreate: this.phase === 'error' });
      }
    },
    async ensureTtsConfiguredOrOpenSetup() {
      if (!this.agentId || !this.commandClient) {
        if (!this.fallbackModelId) {
          await this.openSettings();
          return false;
        }
        return true;
      }
      try {
        const view = await getContactTts(this.commandClient, {
          agentId: this.agentId,
          virtualAgentId: this.virtualAgentId,
        });
        if (contactTtsNeedsSetup(view)) {
          await this.openSettings();
          return false;
        }
        return true;
      } catch (_) {
        await this.openSettings();
        return false;
      }
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
    async refreshVoices(modelId) {
      if (!this.commandClient || !modelId) {
        this.voiceOptions = [];
        return;
      }
      this.voicesLoading = true;
      try {
        const listed = await listTtsVoices(this.commandClient, { modelId });
        const picker = ttsVoicesForPicker({
          voices: listed.voices,
          currentVoiceId:
            this.draftVoicePreset && this.draftVoicePreset !== '__custom__'
              ? this.draftVoicePreset
              : this.customVoicePreset || null,
        });
        this.voiceOptions = picker.options;
        this.allowCustomVoice = picker.allowCustom;
        if (picker.selectedId && !this.draftVoicePreset) {
          this.draftVoicePreset = picker.selectedId;
        }
      } catch (err) {
        this.voiceOptions = [];
        this.settingsError = err instanceof Error ? err.message : String(err);
      } finally {
        this.voicesLoading = false;
      }
    },
    async onGear() {
      if (this.settingsOpen) {
        this.settingsOpen = false;
        return;
      }
      await this.openSettings();
    },
    async openSettings() {
      this.settingsOpen = true;
      if (!this.commandClient) return;
      this.settingsError = null;
      this.pendingSampleFile = null;
      this.clearSampleOnSave = false;
      try {
        this.ttsModels = await listAudioModels(this.commandClient, 'tts');
        const view = this.agentId
          ? await getContactTts(this.commandClient, {
              agentId: this.agentId,
              virtualAgentId: this.virtualAgentId,
            })
          : null;
        this.canSetVoiceSample = !view || view.canSetVoiceSample !== false;
        this.draftModelId =
          (view && view.effectiveTtsModelId) ||
          (this.ttsModels[0] && this.ttsModels[0].id) ||
          '';
        const preset = (view && view.effectiveVoicePreset) || '';
        this.draftVoicePreset = preset;
        this.customVoicePreset = '';
        this.hasVoiceSample = Boolean(view && view.effectiveVoiceSampleRef);
        this.sampleLabel = this.hasVoiceSample
          ? (view.effectiveVoiceSampleRef.objectKey.split('/').pop() || 'voice sample')
          : '';
        this.draftSampleTranscript =
          (view && (view.voiceSampleTranscript || view.effectiveVoiceSampleTranscript)) || '';
        if (this.draftModelId && !this.canConfigureAgent) {
          await this.refreshVoices(this.draftModelId);
        }
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
    resolvedVoicePreset() {
      if (this.draftVoicePreset === '__custom__') {
        return this.customVoicePreset.trim() || null;
      }
      return this.draftVoicePreset ? String(this.draftVoicePreset).trim() : null;
    },
    onSampleFilePicked(ev) {
      const file = ev && ev.target && ev.target.files && ev.target.files[0];
      this.settingsError = null;
      if (!file) {
        this.pendingSampleFile = null;
        return;
      }
      if (file.size > VOICE_SAMPLE_MAX_BYTES) {
        this.settingsError = this.L.voiceSampleTooLarge;
        this.pendingSampleFile = null;
        if (this.$refs.sampleFile) this.$refs.sampleFile.value = '';
        return;
      }
      this.pendingSampleFile = file;
      this.clearSampleOnSave = false;
      this.sampleLabel = file.name || 'voice-sample.wav';
    },
    clearSampleDraft() {
      this.pendingSampleFile = null;
      this.clearSampleOnSave = this.hasVoiceSample;
      this.sampleLabel = '';
      this.draftSampleTranscript = '';
      if (this.$refs.sampleFile) this.$refs.sampleFile.value = '';
    },
    async uploadPendingSample() {
      if (!this.pendingSampleFile || !this.commandClient) return null;
      this.uploadingSample = true;
      try {
        const uploaded = await uploadAttachment(this.commandClient, this.pendingSampleFile, {
          module: 'contact-tts-voice',
          originalName: this.pendingSampleFile.name || 'voice-sample.wav',
          encryptionTier: 'user-known',
        });
        return {
          bucketId: uploaded.workspaceId,
          objectKey: uploaded.storageKey,
        };
      } finally {
        this.uploadingSample = false;
      }
    },
    async saveOverride() {
      if (!this.commandClient || !this.agentId) return;
      if (!this.canConfigureAgent && !this.draftModelId) return;
      this.saving = true;
      this.settingsError = null;
      try {
        let voiceSampleRef;
        let clearVoiceSample = false;
        if (this.clearSampleOnSave) {
          voiceSampleRef = null;
          clearVoiceSample = true;
        } else if (this.pendingSampleFile) {
          voiceSampleRef = await this.uploadPendingSample();
        }
        const modelId =
          this.draftModelId ||
          (this.ttsModels[0] && this.ttsModels[0].id) ||
          this.fallbackModelId;
        if (!modelId) {
          throw new Error(this.L.noTtsModel);
        }
        const payload = {
          agentId: this.agentId,
          ttsModelId: modelId,
          virtualAgentId: this.virtualAgentId,
        };
        if (!this.canConfigureAgent) {
          payload.ttsVoicePreset = this.resolvedVoicePreset();
        }
        if (clearVoiceSample) {
          payload.clearVoiceSample = true;
          payload.voiceSampleRef = null;
          payload.voiceSampleTranscript = null;
        } else if (voiceSampleRef) {
          payload.voiceSampleRef = voiceSampleRef;
          payload.voiceSampleTranscript = this.draftSampleTranscript.trim() || null;
        } else if (this.draftSampleTranscript.trim()) {
          payload.voiceSampleTranscript = this.draftSampleTranscript.trim();
        }
        await setContactTts(this.commandClient, payload);
        this.settingsOpen = false;
        this.pendingSampleFile = null;
        this.clearSampleOnSave = false;
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
  min-width: 220px;
  max-width: 280px;
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
.nexus-speak-widget__input,
.nexus-speak-widget__file {
  font: inherit;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #e9ecef;
  border-radius: 4px;
}
.nexus-speak-widget__sample-label {
  font-size: 11px;
  margin: 4px 0 0;
  opacity: 0.85;
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
