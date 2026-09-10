<template>
  <div v-if="isOpen" class="nx-mg-overlay" @click.self="onOverlayClose">
    <div class="nx-mg-dialog" role="dialog" aria-modal="true" :aria-label="title">
      <header class="nx-mg-header">
        <h2 class="nx-mg-title">{{ title }}</h2>
        <button type="button" class="nx-mg-icon-btn" :disabled="busy && !!workloadId" @click="close">
          ×
        </button>
      </header>

      <div class="nx-mg-body">
        <p v-if="!filteredModels.length" class="nx-mg-hint nx-mg-hint--warn">
          No matching models in the catalog yet.
        </p>

        <label class="nx-mg-field">
          <span class="nx-mg-label">Model</span>
          <select class="nx-mg-input" :value="modelId" :disabled="busy" @change="onModelChange">
            <option v-for="m in filteredModels" :key="m.id" :value="m.id">
              {{ modelLabel(m) }}
            </option>
          </select>
        </label>
        <p v-if="selectedSummary" class="nx-mg-hint">{{ selectedSummary }}</p>
        <p v-if="referenceNote && maxRefs > 0" class="nx-mg-hint">{{ referenceNote }}</p>

        <label class="nx-mg-field">
          <span class="nx-mg-label">Prompt</span>
          <textarea
            class="nx-mg-input nx-mg-textarea"
            rows="3"
            :value="prompt"
            :disabled="busy"
            :placeholder="examplePrompt"
            @input="onPromptInput"
          />
        </label>
        <button type="button" class="nx-mg-btn nx-mg-btn--ghost" :disabled="busy" @click="randomExample">
          Random example
        </button>

        <label v-if="showNegative" class="nx-mg-field">
          <span class="nx-mg-label">Negative prompt (optional)</span>
          <textarea
            class="nx-mg-input nx-mg-textarea"
            rows="2"
            :value="negativePrompt"
            :disabled="busy"
            placeholder="Things to avoid…"
            @input="onNegativeInput"
          />
        </label>

        <div v-if="showSizeEnum" class="nx-mg-field">
          <span class="nx-mg-label">Size</span>
          <select class="nx-mg-input" :value="options.size || ''" :disabled="busy" @change="onSizeChange">
            <option v-for="s in sizeOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div v-if="showSizeWxH" class="nx-mg-row">
          <label class="nx-mg-field nx-mg-field--half">
            <span class="nx-mg-label">Width</span>
            <input
              class="nx-mg-input"
              type="number"
              :value="options.width"
              :min="sizeWidth?.min"
              :max="sizeWidth?.max"
              :step="sizeWidth?.step || 1"
              :disabled="busy"
              @input="onWidthInput"
            />
          </label>
          <label class="nx-mg-field nx-mg-field--half">
            <span class="nx-mg-label">Height</span>
            <input
              class="nx-mg-input"
              type="number"
              :value="options.height"
              :min="sizeHeight?.min"
              :max="sizeHeight?.max"
              :step="sizeHeight?.step || 1"
              :disabled="busy"
              @input="onHeightInput"
            />
          </label>
        </div>

        <label v-if="showSeed" class="nx-mg-field">
          <span class="nx-mg-label">Seed</span>
          <input
            class="nx-mg-input"
            type="number"
            :value="options.seed == null ? '' : options.seed"
            :disabled="busy"
            placeholder="Optional"
            @input="onSeedInput"
          />
        </label>

        <label v-if="showBatch" class="nx-mg-field">
          <span class="nx-mg-label">Batch size</span>
          <input
            class="nx-mg-input"
            type="number"
            :value="options.batchSize || 1"
            :min="batchRange.min"
            :max="batchRange.max"
            :disabled="busy"
            @input="onBatchInput"
          />
        </label>

        <div v-if="showVideoOpts" class="nx-mg-row">
          <label v-if="durationRange" class="nx-mg-field nx-mg-field--half">
            <span class="nx-mg-label">Duration (sec)</span>
            <input
              class="nx-mg-input"
              type="number"
              :value="options.durationSec"
              :min="durationRange.min"
              :max="durationRange.max"
              :disabled="busy"
              @input="onDurationInput"
            />
          </label>
          <label v-if="fpsRange" class="nx-mg-field nx-mg-field--half">
            <span class="nx-mg-label">FPS</span>
            <input
              class="nx-mg-input"
              type="number"
              :value="options.fps"
              :min="fpsRange.min"
              :max="fpsRange.max"
              :disabled="busy"
              @input="onFpsInput"
            />
          </label>
        </div>

        <div v-if="maxRefs > 0" class="nx-mg-section">
          <p class="nx-mg-hint">
            Reference images ({{ references.length }}/{{ maxRefs }})
          </p>
          <input
            ref="refFile"
            type="file"
            accept="image/*"
            class="nx-mg-hidden"
            @change="onRefFile"
          />
          <div class="nx-mg-tray">
            <button
              type="button"
              class="nx-mg-btn nx-mg-btn--ghost"
              :disabled="busy || references.length >= maxRefs"
              @click="$refs.refFile && $refs.refFile.click()"
            >
              {{ references.length ? 'Add reference' : 'Reference image' }}
            </button>
            <button
              v-for="ref in references"
              :key="ref.id"
              type="button"
              class="nx-mg-thumb"
              @click="removeReference(ref.id)"
              title="Remove reference"
            >
              <img :src="ref.preview" alt="" />
            </button>
          </div>
        </div>

        <div v-if="candidates.length" class="nx-mg-section">
          <p class="nx-mg-hint">Staged results ({{ candidates.length }})</p>
          <div v-if="activeCandidate" class="nx-mg-preview">
            <video
              v-if="activeCandidate.kind === 'video'"
              :src="activeCandidate.url"
              controls
              class="nx-mg-preview-media"
            />
            <img
              v-else
              :src="activeCandidate.url"
              alt=""
              class="nx-mg-preview-media"
            />
          </div>
          <div class="nx-mg-tray">
            <button
              v-for="c in candidates"
              :key="c.id"
              type="button"
              class="nx-mg-thumb"
              :class="{ 'nx-mg-thumb--active': c.id === selectedCandidateId }"
              @click="selectCandidate(c.id)"
            >
              <video v-if="c.kind === 'video'" :src="c.url" muted />
              <img v-else :src="c.url" alt="" />
            </button>
          </div>
          <div class="nx-mg-actions">
            <button
              type="button"
              class="nx-mg-btn nx-mg-btn--ghost"
              :disabled="busy || !activeCandidate || maxRefs <= 0 || activeCandidate.kind !== 'image'"
              @click="useAsReference"
            >
              Use selected as reference
            </button>
            <button
              type="button"
              class="nx-mg-btn nx-mg-btn--primary"
              :disabled="busy || !activeCandidate || applying"
              @click="applySelected"
            >
              {{ deferApply ? 'Save selected' : 'Apply selected' }}
            </button>
          </div>
        </div>

        <div class="nx-mg-actions">
          <button
            type="button"
            class="nx-mg-btn nx-mg-btn--primary"
            :disabled="busy || !modelId || !generationEnabled"
            @click="generate"
          >
            {{ busy ? 'Generating…' : 'Generate' }}
          </button>
          <button
            v-if="busy && workloadId"
            type="button"
            class="nx-mg-btn nx-mg-btn--ghost"
            @click="cancelWorkload"
          >
            Cancel
          </button>
          <template v-if="allowUpload">
            <input
              ref="uploadFile"
              type="file"
              accept="image/*,video/*"
              class="nx-mg-hidden"
              @change="onUploadFile"
            />
            <button
              type="button"
              class="nx-mg-btn nx-mg-btn--ghost"
              :disabled="busy"
              @click="$refs.uploadFile && $refs.uploadFile.click()"
            >
              Upload
            </button>
          </template>
        </div>

        <div v-if="workloadId && workload" class="nx-mg-progress">
          <div class="nx-mg-progress-bar">
            <div
              class="nx-mg-progress-fill"
              :style="{ width: `${workload.progressPercent || 0}%` }"
            />
          </div>
          <p class="nx-mg-hint">
            {{ workload.status }}
            <span v-if="workload.progressPercent != null"> · {{ workload.progressPercent }}%</span>
            <span v-if="workload.estimatedWaitSec != null">
              · ~{{ workload.estimatedWaitSec }}s
            </span>
          </p>
        </div>

        <p v-if="error" class="nx-mg-error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import {
  createMediaGenerationSession,
  isImageResultModel,
  isVideoResultModel,
  getModelGenerationIo,
  modelReferenceImageLimits,
  modelSupportsNegativePrompt,
} from '@nexus/media-generation-core';
import { pickRandomMediaPromptExample } from './prompt-examples';

export default {
  name: 'MediaGenerationDialog',
  props: {
    value: { type: Boolean, default: undefined },
    open: { type: Boolean, default: undefined },
    adapter: { type: Object, default: null },
    /** Factory () => MediaGenerationAdapter — preferred when adapter changes per open. */
    adapterFactory: { type: Function, default: null },
    outputType: {
      type: String,
      default: 'image',
      validator: (v) => ['image', 'video', 'both'].includes(v),
    },
    deferApply: { type: Boolean, default: false },
    title: { type: String, default: 'Generate media' },
    /** Direct upload bypass (default false — avatar hosts use their own upload). */
    allowUpload: { type: Boolean, default: false },
  },
  data() {
    return {
      session: null,
      unsub: null,
      snap: null,
      examplePrompt: pickRandomMediaPromptExample(),
      applying: false,
    };
  },
  computed: {
    isOpen() {
      if (this.value !== undefined) return !!this.value;
      return !!this.open;
    },
    prompt() {
      return this.snap?.prompt ?? '';
    },
    negativePrompt() {
      return this.snap?.negativePrompt ?? '';
    },
    modelId() {
      return this.snap?.modelId ?? '';
    },
    options() {
      return this.snap?.options ?? {};
    },
    references() {
      return this.snap?.references ?? [];
    },
    candidates() {
      return this.snap?.candidates ?? [];
    },
    selectedCandidateId() {
      return this.snap?.selectedCandidateId ?? null;
    },
    busy() {
      return !!this.snap?.busy;
    },
    error() {
      return this.snap?.error ?? null;
    },
    workloadId() {
      return this.snap?.workloadId ?? null;
    },
    workload() {
      return this.snap?.workload ?? null;
    },
    generationEnabled() {
      return this.snap?.generationEnabled !== false;
    },
    filteredModels() {
      const models = this.snap?.models ?? [];
      if (this.outputType === 'both') return models;
      if (this.outputType === 'video') return models.filter(isVideoResultModel);
      return models.filter(isImageResultModel);
    },
    selectedModel() {
      return this.filteredModels.find((m) => m.id === this.modelId) ?? null;
    },
    generationIo() {
      return getModelGenerationIo(this.selectedModel);
    },
    selectedSummary() {
      return this.selectedModel?.shortSummary || null;
    },
    referenceNote() {
      return (
        this.generationIo?.referenceImageNote ||
        this.selectedModel?.referenceImageNote ||
        null
      );
    },
    maxRefs() {
      return modelReferenceImageLimits(this.selectedModel).max;
    },
    showNegative() {
      return modelSupportsNegativePrompt(this.selectedModel);
    },
    showSizeEnum() {
      return this.generationIo?.size?.mode === 'enum';
    },
    showSizeWxH() {
      return this.generationIo?.size?.mode === 'wxh';
    },
    sizeOptions() {
      return this.generationIo?.size?.options ?? [];
    },
    sizeWidth() {
      return this.generationIo?.size?.width ?? null;
    },
    sizeHeight() {
      return this.generationIo?.size?.height ?? null;
    },
    showSeed() {
      return !!this.generationIo?.seed?.supported;
    },
    showBatch() {
      return !!this.generationIo?.batchSize;
    },
    batchRange() {
      return this.generationIo?.batchSize ?? { min: 1, max: 8, default: 1 };
    },
    durationRange() {
      return this.generationIo?.durationSec ?? null;
    },
    fpsRange() {
      return this.generationIo?.fps ?? null;
    },
    showVideoOpts() {
      return !!(this.durationRange || this.fpsRange);
    },
    activeCandidate() {
      const list = this.candidates;
      if (!list.length) return null;
      return list.find((c) => c.id === this.selectedCandidateId) ?? list[0];
    },
  },
  watch: {
    isOpen: {
      immediate: true,
      handler(open) {
        if (open) this.bootstrap();
        else this.teardown();
      },
    },
  },
  beforeDestroy() {
    this.teardown();
  },
  methods: {
    resolveAdapter() {
      if (typeof this.adapterFactory === 'function') return this.adapterFactory();
      if (this.adapter) return this.adapter;
      throw new Error('MediaGenerationDialog requires adapter or adapterFactory');
    },
    syncSnap() {
      this.snap = this.session ? { ...this.session.getState() } : null;
    },
    async bootstrap() {
      this.teardown();
      this.examplePrompt = pickRandomMediaPromptExample();
      const adapter = this.resolveAdapter();
      this.session = createMediaGenerationSession({ adapter });
      this.unsub = this.session.subscribe(() => this.syncSnap());
      this.session.setPrompt(this.examplePrompt);
      this.syncSnap();
      try {
        await this.session.loadModels();
        const first = this.filteredModels[0];
        if (first && this.session.getState().modelId !== first.id) {
          this.session.setModelId(first.id);
        }
      } catch (e) {
        this.session?.setError(e instanceof Error ? e.message : String(e));
        this.syncSnap();
      }
    },
    teardown() {
      if (this.unsub) {
        this.unsub();
        this.unsub = null;
      }
      if (this.session) {
        void this.session.cancelWorkload();
        this.session.clear();
        this.session = null;
      }
      this.snap = null;
    },
    modelLabel(m) {
      return m.displayName || m.name || m.id;
    },
    onPromptInput(e) {
      this.session?.setPrompt(e.target.value);
    },
    onNegativeInput(e) {
      this.session?.setNegativePrompt(e.target.value);
    },
    onModelChange(e) {
      this.session?.setModelId(e.target.value);
    },
    onSizeChange(e) {
      this.session?.setOptions({ size: e.target.value });
    },
    onWidthInput(e) {
      const n = Number(e.target.value);
      this.session?.setOptions({ width: Number.isFinite(n) ? n : null });
    },
    onHeightInput(e) {
      const n = Number(e.target.value);
      this.session?.setOptions({ height: Number.isFinite(n) ? n : null });
    },
    onSeedInput(e) {
      const raw = e.target.value;
      if (raw === '') {
        this.session?.setOptions({ seed: null });
        return;
      }
      const n = Number(raw);
      this.session?.setOptions({ seed: Number.isFinite(n) ? Math.floor(n) : null });
    },
    onBatchInput(e) {
      const n = Number(e.target.value);
      const clamped = Number.isFinite(n)
        ? Math.max(this.batchRange.min, Math.min(this.batchRange.max, Math.floor(n)))
        : 1;
      this.session?.setOptions({ batchSize: clamped });
    },
    onDurationInput(e) {
      const n = Number(e.target.value);
      this.session?.setOptions({ durationSec: Number.isFinite(n) ? n : null });
    },
    onFpsInput(e) {
      const n = Number(e.target.value);
      this.session?.setOptions({ fps: Number.isFinite(n) ? n : null });
    },
    randomExample() {
      const example = pickRandomMediaPromptExample();
      this.examplePrompt = example;
      this.session?.setPrompt(example);
    },
    onRefFile(e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !this.session) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        try {
          this.session.addReferenceFromFile({
            base64,
            mime: file.type || 'image/png',
            preview: dataUrl,
          });
        } catch {
          /* error on session state */
        }
      };
      reader.readAsDataURL(file);
    },
    removeReference(id) {
      this.session?.removeReference(id);
    },
    selectCandidate(id) {
      this.session?.selectCandidate(id);
    },
    async useAsReference() {
      if (!this.session) return;
      try {
        await this.session.useSelectedAsReference();
      } catch {
        /* error on session state */
      }
    },
    async generate() {
      await this.session?.generate();
    },
    async cancelWorkload() {
      await this.session?.cancelWorkload();
    },
    onUploadFile(e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !this.session) return;
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!this.deferApply) {
          this.$emit('apply', { url: dataUrl, kind, generated: false });
          this.close();
          return;
        }
        this.session?.appendCandidate({ url: dataUrl, kind, generated: false });
      };
      reader.readAsDataURL(file);
    },
    async applySelected() {
      const c = this.session?.applySelected();
      if (!c) return;
      this.applying = true;
      try {
        this.$emit('apply', { url: c.url, kind: c.kind, generated: c.generated });
        if (!this.deferApply) this.close();
      } finally {
        this.applying = false;
      }
    },
    onOverlayClose() {
      if (this.busy && this.workloadId) return;
      this.close();
    },
    close() {
      this.$emit('input', false);
      this.$emit('close');
    },
  },
};
</script>

<style>
.nx-mg-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(15, 18, 22, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.nx-mg-dialog {
  width: min(560px, 100%);
  max-height: min(90vh, 900px);
  overflow: auto;
  background: #f7f8fa;
  color: #1a1d21;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}
.nx-mg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #d8dde3;
}
.nx-mg-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}
.nx-mg-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.nx-mg-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.nx-mg-field--half {
  flex: 1;
}
.nx-mg-row {
  display: flex;
  gap: 0.65rem;
}
.nx-mg-label {
  font-size: 0.75rem;
  color: #5b6570;
}
.nx-mg-input {
  border: 1px solid #c5ccd4;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  background: #fff;
}
.nx-mg-textarea {
  resize: vertical;
  min-height: 4rem;
}
.nx-mg-btn {
  border-radius: 6px;
  border: 1px solid transparent;
  padding: 0.4rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.nx-mg-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.nx-mg-btn--primary {
  background: #1f6feb;
  color: #fff;
}
.nx-mg-btn--ghost {
  background: #fff;
  border-color: #c5ccd4;
  color: #1a1d21;
}
.nx-mg-icon-btn {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #5b6570;
}
.nx-mg-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #5b6570;
}
.nx-mg-hint--warn {
  color: #9a6700;
}
.nx-mg-error {
  margin: 0;
  color: #b42318;
  font-size: 0.875rem;
}
.nx-mg-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.nx-mg-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.nx-mg-thumb {
  width: 3.25rem;
  height: 3.25rem;
  padding: 0;
  border: 2px solid #c5ccd4;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
}
.nx-mg-thumb--active {
  border-color: #1f6feb;
}
.nx-mg-thumb img,
.nx-mg-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.nx-mg-preview {
  border: 1px solid #d8dde3;
  border-radius: 8px;
  background: #fff;
  padding: 0.4rem;
}
.nx-mg-preview-media {
  display: block;
  width: 100%;
  max-height: 16rem;
  object-fit: contain;
  border-radius: 4px;
}
.nx-mg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.nx-mg-progress {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.nx-mg-progress-bar {
  height: 6px;
  border-radius: 999px;
  background: #d8dde3;
  overflow: hidden;
}
.nx-mg-progress-fill {
  height: 100%;
  background: #1f6feb;
  transition: width 0.2s ease;
}
.nx-mg-hidden {
  display: none;
}
</style>
