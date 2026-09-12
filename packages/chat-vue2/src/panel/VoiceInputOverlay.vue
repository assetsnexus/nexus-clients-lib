<template>
  <div
    v-if="open"
    class="anx-voice-input-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="titleLabel"
  >
    <div class="anx-voice-input-overlay__card" @click.stop>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">{{ titleLabel }}</h6>
        <button
          type="button"
          class="btn btn-link btn-sm p-0"
          :aria-label="closeLabel"
          :disabled="state === 'transcribing'"
          @click="onClose"
        >
          ×
        </button>
      </div>

      <div class="form-row mb-2">
        <div class="col-md-8 mb-2 mb-md-0">
          <label class="small text-muted d-block mb-1">{{ modelLabel }}</label>
          <select
            v-model="localModelId"
            class="form-control form-control-sm"
            :disabled="modelsLoading || state === 'recording' || state === 'transcribing'"
          >
            <option value="">{{ modelNoneLabel }}</option>
            <option v-for="m in sttModels" :key="m.id" :value="m.id">
              {{ modelOptionLabel(m) }}
            </option>
          </select>
          <div v-if="modelsError" class="small text-warning mt-1">{{ modelsError }}</div>
        </div>
        <div class="col-md-4">
          <label class="small text-muted d-block mb-1">{{ languageLabel }}</label>
          <select
            v-model="localLanguage"
            class="form-control form-control-sm"
            :disabled="state === 'recording' || state === 'transcribing'"
            @change="onLanguagePicked"
          >
            <option :value="autoLanguageValue">{{ languageAutoLabel }}</option>
            <option v-for="row in languageOptions" :key="row.code" :value="row.code">
              {{ row.native }} ({{ row.code }})
            </option>
          </select>
        </div>
      </div>

      <div
        v-if="showTtsSetup"
        class="border rounded p-2 mb-2 anx-voice-input-overlay__tts"
      >
        <div class="small font-weight-bold mb-1">{{ ttsSectionTitle }}</div>
        <p class="small text-muted mb-2">{{ ttsSectionHint }}</p>
        <template v-if="canConfigureAgent">
          <button type="button" class="btn btn-outline-secondary btn-sm mb-2" @click="onOpenAgentVoice">
            {{ agentVoiceSettingsLabel }}
          </button>
        </template>
        <template v-else>
          <label class="small text-muted d-block mb-1">{{ ttsModelLabel }}</label>
          <select
            v-model="ttsDraftModelId"
            class="form-control form-control-sm mb-2"
            :disabled="ttsLoading || ttsSaving"
          >
            <option value="">{{ modelNoneLabel }}</option>
            <option v-for="m in ttsModels" :key="m.id" :value="m.id">
              {{ m.displayName || m.id }}
            </option>
          </select>
          <label class="small text-muted d-block mb-1">{{ ttsVoiceLabel }}</label>
          <select
            v-model="ttsDraftVoicePreset"
            class="form-control form-control-sm mb-2"
            :disabled="ttsLoading || ttsSaving || !ttsDraftModelId"
          >
            <option value="">—</option>
            <option v-for="v in ttsVoiceOptions" :key="v.id" :value="v.id">
              {{ v.title }}
            </option>
          </select>
        </template>
        <label class="small text-muted d-block mb-1">{{ customVoiceSampleLabel }}</label>
        <input
          ref="ttsSampleFile"
          type="file"
          accept="audio/wav,audio/x-wav,audio/wave,.wav,audio/mpeg,audio/mp3"
          class="form-control-file form-control-sm mb-1"
          :disabled="ttsSaving"
          @change="onTtsSamplePicked"
        />
        <input
          v-model="ttsDraftSampleTranscript"
          type="text"
          class="form-control form-control-sm mb-2"
          :placeholder="sampleTranscriptPlaceholder"
          :disabled="ttsSaving"
        />
        <div class="d-flex flex-wrap" style="gap: 0.5rem">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="ttsSaving || (!canConfigureAgent && !ttsDraftModelId)"
            @click="saveTtsSettings"
          >
            {{ ttsSaving ? savingLabel : saveTtsLabel }}
          </button>
        </div>
        <p v-if="ttsError" class="small text-danger mb-0 mt-1">{{ ttsError }}</p>
      </div>

      <div v-if="state === 'preview'" class="anx-voice-input-overlay__preview">
        <p class="small text-muted mb-1">{{ previewHint }}</p>
        <audio v-if="previewUrl" class="w-100 mb-2" controls :src="previewUrl" />
        <textarea
          v-model="previewText"
          class="form-control form-control-sm mb-2"
          rows="3"
          :aria-label="previewHint"
        />
        <div class="d-flex flex-wrap justify-content-end" style="gap: 0.5rem">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="onRerecord">
            {{ rerecordLabel }}
          </button>
          <button
            type="button"
            class="btn btn-outline-primary btn-sm"
            :disabled="!previewText.trim()"
            @click="onQuickSend"
          >
            {{ quickSendLabel }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!previewText.trim()"
            @click="onInsertText"
          >
            {{ insertLabel }}
          </button>
        </div>
      </div>

      <div v-else class="text-center py-2">
        <div
          class="anx-voice-input-overlay__mic mx-auto mb-2"
          :class="{
            'is-recording': state === 'recording',
            'is-busy': state === 'transcribing' || state === 'requesting',
          }"
        >
          🎙
        </div>
        <p class="small text-muted mb-1">{{ statusLabel }}</p>
        <p v-if="state === 'recording'" class="small tabular-nums mb-1">{{ formatTime(elapsedSec) }}</p>
        <p v-if="livePartial" class="small mb-1 px-2">{{ livePartial }}</p>
        <p v-if="errorMessage" class="small text-danger mb-2">{{ errorMessage }}</p>
        <div class="d-flex flex-wrap justify-content-center" style="gap: 0.5rem">
          <button
            v-if="state === 'idle' || state === 'error'"
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!localModelId"
            @click="onStart"
          >
            {{ micReady ? recordLabel : allowMicLabel }}
          </button>
          <button
            v-else-if="state === 'recording'"
            type="button"
            class="btn btn-primary btn-sm"
            @click="onStop"
          >
            {{ stopLabel }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-outline-secondary btn-sm"
            disabled
          >
            {{ processingLabel }}
          </button>
          <button
            type="button"
            class="btn btn-link btn-sm"
            :disabled="state === 'transcribing'"
            @click="onClose"
          >
            {{ cancelLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  createLiveSttSession,
  connectLiveSttWebSocket,
  transcribeOrNull,
  listAudioModels,
  filterSttModelsForPicker,
  findSttModel,
  modelSupportsSttStream,
  getContactTts,
  setContactTts,
  listTtsVoices,
  ttsVoicesForPicker,
  contactTtsNeedsSetup,
  uploadAttachment,
} from '@nexus/chat-core'
import {
  pickMediaRecorderMimeType,
  micAccessErrorCode,
  requestMicrophoneStream,
  STT_MIN_BLOB_BYTES,
} from './voice-utils/mediaRecorder.js'
import {
  STT_AUTO_LANGUAGE,
  sttLanguageForApi as toSttLanguageForApi,
  sttLanguageSelectOptions,
} from './voice-utils/sttLanguageOptions.js'

const DEFAULT_VOICE_INPUT_LABELS = {
  title: 'Voice input',
  close: 'Close',
  model: 'STT model',
  modelNone: 'Select a model',
  language: 'Language',
  languageAuto: 'Auto',
  previewHint: 'Edit transcript before inserting',
  rerecord: 'Re-record',
  quickSend: 'Send',
  insert: 'Insert',
  allowMic: 'Allow microphone',
  record: 'Record',
  stop: 'Stop',
  processing: 'Processing…',
  cancel: 'Cancel',
  transcribing: 'Transcribing…',
  listening: 'Listening…',
  requesting: 'Requesting mic…',
  ready: 'Ready',
  needMic: 'Microphone needed',
  micDenied: 'Microphone permission denied',
  micNotFound: 'No microphone found',
  micUnsupported: 'Microphone not supported',
  micUnavailable: 'Microphone unavailable',
  streamBadge: 'live',
  batchBadge: 'batch',
  noSttModels: 'No STT models available',
  modelsFailed: 'Failed to load STT models',
  sttFailed: 'Transcription failed',
  streamUnavailable: 'Live STT unavailable',
  tooShort: 'Recording too short',
  transportStream: 'stream',
  transportBatch: 'batch',
  ttsSectionTitle: 'Reply voice (TTS)',
  ttsSectionHint: 'No reply voice configured yet — set a model and optional custom WAV on this contact.',
  ttsModel: 'TTS model',
  ttsVoice: 'Voice preset',
  customVoiceSample: 'Custom WAV sample',
  sampleTranscript: 'Sample transcript (optional)',
  saveTts: 'Save reply voice',
  saving: 'Saving…',
  agentVoiceSettings: 'Open agent voice settings',
}

export default {
  name: 'VoiceInputOverlay',
  props: {
    open: { type: Boolean, default: false },
    commandClient: { type: Object, default: null },
    /** Same entitled catalog as chat model selection (`models.available` + entitlements). */
    models: { type: Array, default: () => [] },
    /** Preferred STT model id from uiStore */
    modelId: { type: String, default: null },
    language: { type: String, default: '' },
    agentId: { type: String, default: null },
    /** Inference agent id for contact-tts (may differ from VE agentId). */
    inferenceAgentId: { type: String, default: null },
    virtualAgentId: { type: String, default: null },
    canConfigureAgent: { type: Boolean, default: false },
    /** When true, force-show TTS setup even if already configured. */
    forceTtsSetup: { type: Boolean, default: false },
    labels: { type: Object, default: null },
  },
  data() {
    return {
      state: 'idle',
      errorMessage: null,
      elapsedSec: 0,
      previewText: '',
      livePartial: '',
      micReady: false,
      audioBlob: null,
      previewUrl: null,
      modelsLoading: false,
      modelsError: null,
      catalogOverride: null,
      localModelId: this.modelId || '',
      localLanguage: this.language || '',
      mediaStream: null,
      mediaRecorder: null,
      chunks: [],
      timerId: null,
      liveSocket: null,
      usedLiveStream: false,
      showTtsSetup: false,
      ttsModels: [],
      ttsVoiceOptions: [],
      ttsDraftModelId: '',
      ttsDraftVoicePreset: '',
      ttsDraftSampleTranscript: '',
      ttsPendingSample: null,
      ttsLoading: false,
      ttsSaving: false,
      ttsError: null,
    }
  },
  computed: {
    L() {
      return { ...DEFAULT_VOICE_INPUT_LABELS, ...(this.labels || {}) }
    },
    contactAgentId() {
      return this.inferenceAgentId || this.agentId || null
    },
    ttsSectionTitle() {
      return this.L.ttsSectionTitle
    },
    ttsSectionHint() {
      return this.L.ttsSectionHint
    },
    ttsModelLabel() {
      return this.L.ttsModel
    },
    ttsVoiceLabel() {
      return this.L.ttsVoice
    },
    customVoiceSampleLabel() {
      return this.L.customVoiceSample
    },
    sampleTranscriptPlaceholder() {
      return this.L.sampleTranscript
    },
    saveTtsLabel() {
      return this.L.saveTts
    },
    savingLabel() {
      return this.L.saving
    },
    agentVoiceSettingsLabel() {
      return this.L.agentVoiceSettings
    },
    titleLabel() {
      return this.L.title
    },
    closeLabel() {
      return this.L.close
    },
    modelLabel() {
      return this.L.model
    },
    modelNoneLabel() {
      return this.L.modelNone
    },
    languageLabel() {
      return this.L.language
    },
    languageAutoLabel() {
      return this.L.languageAuto
    },
    autoLanguageValue() {
      return STT_AUTO_LANGUAGE
    },
    languageOptions() {
      return sttLanguageSelectOptions(this.language || this.localLanguage)
    },
    /** ISO tag for STT APIs; Auto → `null` (omit / auto-detect). */
    sttLanguageForApi() {
      return toSttLanguageForApi(this.localLanguage)
    },
    previewHint() {
      return this.L.previewHint
    },
    rerecordLabel() {
      return this.L.rerecord
    },
    quickSendLabel() {
      return this.L.quickSend
    },
    insertLabel() {
      return this.L.insert
    },
    sttModels() {
      return filterSttModelsForPicker(this.catalogOverride || this.models)
    },
    selectedSttModel() {
      return findSttModel(this.sttModels, this.localModelId)
    },
    isStreamModel() {
      return modelSupportsSttStream(this.selectedSttModel)
    },
    allowMicLabel() {
      return this.L.allowMic
    },
    recordLabel() {
      return this.L.record
    },
    stopLabel() {
      return this.L.stop
    },
    processingLabel() {
      return this.L.processing
    },
    cancelLabel() {
      return this.L.cancel
    },
    statusLabel() {
      if (this.state === 'transcribing') return this.L.transcribing
      if (this.state === 'recording') return this.L.listening
      if (this.state === 'requesting') return this.L.requesting
      if (this.micReady) return this.L.ready
      return this.L.needMic
    },
  },
  watch: {
    open(val) {
      if (val) {
        this.resetSoft()
        this.catalogOverride = null
        this.syncSelectedModel()
        this.syncLocalLanguage()
        this.ensureSttCatalog()
        void this.ensureTtsSetupSection()
      } else {
        this.teardown(true)
      }
    },
    ttsDraftModelId(val) {
      if (this.open && val && !this.canConfigureAgent) void this.refreshTtsVoices(val)
    },
    modelId(val) {
      if (this.open) this.localModelId = val || this.localModelId
    },
    language() {
      if (this.open) this.syncLocalLanguage()
    },
    models: {
      handler() {
        if (this.open) this.syncSelectedModel()
      },
      deep: false,
    },
  },
  beforeDestroy() {
    this.teardown(true)
  },
  methods: {
    tMicError(code) {
      const map = {
        denied: 'micDenied',
        not_found: 'micNotFound',
        unsupported: 'micUnsupported',
        unavailable: 'micUnavailable',
      }
      return this.L[map[code]] || this.L.micUnavailable
    },
    formatTime(s) {
      const n = Math.max(0, Number(s) || 0)
      return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
    },
    modelOptionLabel(model) {
      const name = (model && (model.label || model.displayName || model.id)) || ''
      const badge = modelSupportsSttStream(model)
        ? this.L.streamBadge
        : this.L.batchBadge
      return badge ? `${name} · ${badge}` : name
    },
    syncLocalLanguage() {
      this.localLanguage = this.language || STT_AUTO_LANGUAGE
    },
    onLanguagePicked() {
      this.$emit('stt-language', this.localLanguage || STT_AUTO_LANGUAGE)
    },
    syncSelectedModel() {
      this.modelsError = this.sttModels.length
        ? null
        : this.L.noSttModels
      if (this.localModelId && findSttModel(this.sttModels, this.localModelId)) return
      if (this.modelId && findSttModel(this.sttModels, this.modelId)) {
        this.localModelId = this.modelId
        return
      }
      this.localModelId = this.sttModels[0] ? this.sttModels[0].id : ''
    },
    async ensureSttCatalog() {
      if (this.sttModels.length) {
        this.syncSelectedModel()
        return
      }
      if (!this.commandClient) {
        this.syncSelectedModel()
        return
      }
      this.modelsLoading = true
      this.modelsError = null
      try {
        const rows = await listAudioModels(this.commandClient, 'stt')
        this.catalogOverride = rows.map((r) => ({
          id: r.id,
          displayName: r.displayName,
          capabilities: r.capabilities,
          category: r.modality,
          modalityTransport: r.modalityTransport,
        }))
        this.syncSelectedModel()
      } catch (_) {
        this.modelsError = this.L.modelsFailed
        this.catalogOverride = null
        this.syncSelectedModel()
      } finally {
        this.modelsLoading = false
      }
    },
    async ensureTtsSetupSection() {
      this.ttsError = null
      this.ttsPendingSample = null
      if (this.forceTtsSetup) {
        this.showTtsSetup = true
        await this.loadTtsDrafts()
        return
      }
      if (!this.commandClient || !this.contactAgentId) {
        this.showTtsSetup = false
        return
      }
      try {
        const view = await getContactTts(this.commandClient, {
          agentId: this.contactAgentId,
          virtualAgentId: this.virtualAgentId,
        })
        this.showTtsSetup = contactTtsNeedsSetup(view)
        if (this.showTtsSetup) await this.loadTtsDrafts(view)
      } catch (_) {
        this.showTtsSetup = true
        await this.loadTtsDrafts(null)
      }
    },
    async loadTtsDrafts(existingView) {
      if (!this.commandClient) return
      this.ttsLoading = true
      try {
        this.ttsModels = await listAudioModels(this.commandClient, 'tts')
        const view =
          existingView ||
          (this.contactAgentId
            ? await getContactTts(this.commandClient, {
                agentId: this.contactAgentId,
                virtualAgentId: this.virtualAgentId,
              })
            : null)
        this.ttsDraftModelId =
          (view && view.effectiveTtsModelId) ||
          (this.ttsModels[0] && this.ttsModels[0].id) ||
          ''
        this.ttsDraftVoicePreset = (view && view.effectiveVoicePreset) || ''
        this.ttsDraftSampleTranscript =
          (view && (view.voiceSampleTranscript || view.effectiveVoiceSampleTranscript)) || ''
        if (this.ttsDraftModelId && !this.canConfigureAgent) {
          await this.refreshTtsVoices(this.ttsDraftModelId)
        }
      } catch (err) {
        this.ttsError = err instanceof Error ? err.message : String(err)
      } finally {
        this.ttsLoading = false
      }
    },
    async refreshTtsVoices(modelId) {
      if (!this.commandClient || !modelId) {
        this.ttsVoiceOptions = []
        return
      }
      try {
        const listed = await listTtsVoices(this.commandClient, { modelId })
        const picker = ttsVoicesForPicker({
          voices: listed.voices,
          currentVoiceId: this.ttsDraftVoicePreset || null,
        })
        this.ttsVoiceOptions = picker.options
        if (picker.selectedId && !this.ttsDraftVoicePreset) {
          this.ttsDraftVoicePreset = picker.selectedId
        }
      } catch (_) {
        this.ttsVoiceOptions = []
      }
    },
    onTtsSamplePicked(ev) {
      const file = ev && ev.target && ev.target.files && ev.target.files[0]
      this.ttsPendingSample = file || null
      this.ttsError = null
      if (file && file.size > 1 * 1024 * 1024) {
        this.ttsError = 'Voice sample must be 1 MB or smaller.'
        this.ttsPendingSample = null
        if (this.$refs.ttsSampleFile) this.$refs.ttsSampleFile.value = ''
      }
    },
    onOpenAgentVoice() {
      this.$emit('open-agent-voice-config', {
        agentId: this.contactAgentId,
        virtualAgentId: this.virtualAgentId,
      })
    },
    async saveTtsSettings() {
      if (!this.commandClient || !this.contactAgentId) return
      if (!this.canConfigureAgent && !this.ttsDraftModelId) return
      this.ttsSaving = true
      this.ttsError = null
      try {
        let voiceSampleRef
        if (this.ttsPendingSample) {
          const uploaded = await uploadAttachment(this.commandClient, this.ttsPendingSample, {
            module: 'contact-tts-voice',
            originalName: this.ttsPendingSample.name || 'voice-sample.wav',
            encryptionTier: 'user-known',
          })
          voiceSampleRef = {
            bucketId: uploaded.workspaceId,
            objectKey: uploaded.storageKey,
          }
        }
        const modelId =
          this.ttsDraftModelId || (this.ttsModels[0] && this.ttsModels[0].id)
        if (!modelId) throw new Error('Select a TTS model')
        await setContactTts(this.commandClient, {
          agentId: this.contactAgentId,
          ttsModelId: modelId,
          ...(this.canConfigureAgent
            ? {}
            : { ttsVoicePreset: this.ttsDraftVoicePreset || null }),
          ...(voiceSampleRef
            ? {
                voiceSampleRef,
                voiceSampleTranscript: this.ttsDraftSampleTranscript.trim() || null,
              }
            : this.ttsDraftSampleTranscript.trim()
              ? { voiceSampleTranscript: this.ttsDraftSampleTranscript.trim() }
              : {}),
          virtualAgentId: this.virtualAgentId,
        })
        this.showTtsSetup = false
        this.ttsPendingSample = null
        this.$emit('tts-saved')
      } catch (err) {
        this.ttsError = err instanceof Error ? err.message : String(err)
      } finally {
        this.ttsSaving = false
      }
    },
    clearTimer() {
      if (this.timerId) {
        clearInterval(this.timerId)
        this.timerId = null
      }
    },
    stopTracks() {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop())
        this.mediaStream = null
      }
    },
    stopLiveSocket() {
      if (this.liveSocket) {
        try {
          this.liveSocket.close()
        } catch (_) { /* ignore */ }
        this.liveSocket = null
      }
    },
    revokePreview() {
      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl)
        this.previewUrl = null
      }
    },
    resetSoft() {
      this.state = 'idle'
      this.errorMessage = null
      this.elapsedSec = 0
      this.previewText = ''
      this.livePartial = ''
      this.audioBlob = null
      this.revokePreview()
      this.chunks = []
      this.usedLiveStream = false
    },
    teardown(full) {
      this.clearTimer()
      this.stopLiveSocket()
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        try {
          this.mediaRecorder.onstop = null
          this.mediaRecorder.stop()
        } catch (_) { /* ignore */ }
      }
      this.mediaRecorder = null
      this.stopTracks()
      if (full) {
        this.resetSoft()
        this.micReady = false
      }
    },
    appendFinalTranscript(piece) {
      const next = String(piece || '').trim()
      if (!next) return
      const gap = this.previewText && !/\s$/.test(this.previewText) ? ' ' : ''
      this.previewText = `${this.previewText}${gap}${next}`.trim()
    },
    async startLiveStt() {
      if (!this.isStreamModel || !this.commandClient) return false
      try {
        const session = await createLiveSttSession(this.commandClient, {
          modelId: this.localModelId,
          agentId: this.agentId || undefined,
          language: this.sttLanguageForApi,
        })
        const endpoint = Array.isArray(session.endpoints) ? session.endpoints[0] : null
        if (!session.token || !endpoint) {
          throw new Error('Live STT session missing token or endpoint')
        }
        this.liveSocket = connectLiveSttWebSocket({
          wsUrl: endpoint,
          token: session.token,
          modelId: session.modelId || this.localModelId,
          onPartial: (text) => {
            this.livePartial = String(text || '')
          },
          onFinal: (text) => {
            this.appendFinalTranscript(text)
            this.livePartial = ''
          },
          onError: (error) => {
            if (!this.previewText && !this.livePartial) {
              this.errorMessage = error || this.L.sttFailed
            }
          },
        })
        this.usedLiveStream = true
        return true
      } catch (err) {
        this.usedLiveStream = false
        this.errorMessage = this.L.streamUnavailable
        return false
      }
    },
    async prepareMic() {
      this.errorMessage = null
      this.state = 'requesting'
      try {
        const stream = await requestMicrophoneStream({ audio: true })
        this.mediaStream = stream
        this.micReady = true
        this.state = 'idle'
        return true
      } catch (err) {
        this.errorMessage = this.tMicError(micAccessErrorCode(err))
        this.state = 'error'
        this.stopTracks()
        this.micReady = false
        return false
      }
    },
    async onStart() {
      if (!this.localModelId) {
        this.errorMessage = this.L.noSttModels
        this.state = 'error'
        return
      }
      if (!this.micReady) {
        const ok = await this.prepareMic()
        if (!ok) return
      }
      this.errorMessage = null
      this.elapsedSec = 0
      this.previewText = ''
      this.livePartial = ''
      this.audioBlob = null
      this.usedLiveStream = false
      this.revokePreview()
      try {
        let stream = this.mediaStream
        if (!stream) {
          stream = await requestMicrophoneStream({ audio: true })
          this.mediaStream = stream
          this.micReady = true
        }
        if (this.isStreamModel) {
          await this.startLiveStt()
        }
        const mimeType = pickMediaRecorderMimeType()
        const rec = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
        this.chunks = []
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.chunks.push(e.data)
          if (this.liveSocket && e.data && e.data.size > 0) {
            e.data.arrayBuffer().then((buf) => {
              try {
                this.liveSocket && this.liveSocket.send(buf)
              } catch (_) { /* drop frame */ }
            })
          }
        }
        rec.onstop = () => {
          this.clearTimer()
          this.stopTracks()
          this.stopLiveSocket()
          void this.afterStop(rec.mimeType || mimeType || 'audio/webm')
        }
        this.mediaRecorder = rec
        rec.start(250)
        this.state = 'recording'
        this.timerId = setInterval(() => {
          this.elapsedSec += 1
        }, 1000)
      } catch (err) {
        this.errorMessage = this.tMicError(micAccessErrorCode(err))
        this.state = 'error'
        this.stopTracks()
        this.stopLiveSocket()
      }
    },
    onStop() {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        try {
          this.mediaRecorder.requestData()
        } catch (_) { /* optional */ }
        this.mediaRecorder.stop()
        this.mediaRecorder = null
      } else {
        this.clearTimer()
        this.stopTracks()
        this.state = 'idle'
      }
    },
    async afterStop(mimeType) {
      this.state = 'transcribing'
      try {
        const blob = new Blob(this.chunks, { type: mimeType })
        if (blob.size < STT_MIN_BLOB_BYTES) {
          throw new Error(this.L.tooShort)
        }
        this.audioBlob = blob
        this.previewUrl = URL.createObjectURL(blob)

        let text = (this.previewText || this.livePartial || '').trim()
        const needBatch = !this.usedLiveStream || !text
        if (needBatch && this.localModelId && this.commandClient) {
          try {
            const stt = await transcribeOrNull(this.commandClient, {
              modelId: this.localModelId,
              audioBlob: blob,
              language: this.sttLanguageForApi,
            })
            if (stt.text) text = stt.text
            this.$emit('stt-model', this.localModelId)
            if (!stt.text && !text) {
              this.errorMessage = this.L.sttFailed
            }
          } catch (err) {
            if (!text) {
              this.errorMessage = err instanceof Error
                ? err.message
                : this.L.sttFailed
            }
          }
        } else if (this.localModelId) {
          this.$emit('stt-model', this.localModelId)
        }
        this.previewText = text
        this.livePartial = ''
        this.state = 'preview'
      } catch (err) {
        this.errorMessage = err instanceof Error ? err.message : this.L.sttFailed
        this.state = 'error'
      }
    },
    onRerecord() {
      this.teardown(false)
      this.resetSoft()
      this.micReady = false
      this.state = 'idle'
    },
    onInsertText() {
      const text = this.previewText.trim()
      if (!text) return
      this.$emit('stt-model', this.localModelId || null)
      this.$emit('confirm-text', text)
      this.onClose()
    },
    onQuickSend() {
      const text = this.previewText.trim()
      if (!text) return
      this.$emit('stt-model', this.localModelId || null)
      this.$emit('confirm-send', text)
      this.onClose()
    },
    onClose() {
      this.teardown(true)
      this.$emit('close')
    },
  },
}
</script>

<style scoped>
.anx-voice-input-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.25), transparent 45%);
}
.anx-voice-input-overlay__card {
  pointer-events: auto;
  width: calc(100% - 1rem);
  margin: 0 0.5rem 0.5rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.75rem 0.75rem 0.5rem 0.5rem;
  border: 1px solid #dee2e6;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.anx-voice-input-overlay__mic {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  border: 2px solid #ced4da;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: #f8f9fa;
}
.anx-voice-input-overlay__mic.is-recording {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.12);
}
.anx-voice-input-overlay__mic.is-busy {
  border-color: #3498db;
  background: rgba(52, 152, 219, 0.12);
}
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
