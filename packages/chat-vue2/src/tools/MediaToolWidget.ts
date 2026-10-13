import { defineComponent } from 'vue';
import {
  fileIdFromStorageExplorerUrl,
  parseMediaAudioUrl,
  parseMediaImages,
  parseMediaWorkloadId,
  parseWorkloadMediaImages,
  toConsoleStorageExplorerUrl,
  workloadResultPathsNeedFileUrl,
  type ChatToolRun,
  type MediaCarouselImage,
} from '@nexus/chat-core';

type PollFn = (
  workloadId: string,
  opts?: { intervalMs?: number; maxAttempts?: number; signal?: AbortSignal },
) => Promise<Record<string, unknown>>;

/**
 * Media carousel for generate_image / generate_audio (Vue 2 Options API).
 * Polls via injected pollWorkload when result only has workloadId.
 */
export const MediaToolWidget = defineComponent({
  name: 'NexusMediaToolWidget',
  props: {
    run: { type: Object, required: true },
    pollWorkload: { type: Function, default: null },
    resolveStoredFile: { type: Function, default: null },
  },
  data() {
    const run = this.run as ChatToolRun;
    return {
      images: parseMediaImages(run.result),
      audioUrl: parseMediaAudioUrl(run.result),
      pending: run.status === 'running',
      error: (run.error || null) as string | null,
      abort: null as AbortController | null,
      inflightWorkloadId: null as string | null,
      /** Set when this tool row has finished or the workload does not exist. Blocks repeat gets. */
      settledKey: null as string | null,
    };
  },
  watch: {
    run: {
      deep: true,
      handler() {
        this.startPoll();
      },
    },
  },
  mounted() {
    this.startPoll();
  },
  beforeDestroy() {
    this.abort?.abort();
  },
  methods: {
    async storedFileImages(
      initial: MediaCarouselImage[],
    ): Promise<MediaCarouselImage[] | null> {
      const resolve = this.resolveStoredFile as
        | ((fileId: string) => Promise<string | null>)
        | null;
      if (typeof resolve !== 'function' || !initial.length) return null;
      const out: MediaCarouselImage[] = [];
      for (const img of initial) {
        const fileId = img.fileId || fileIdFromStorageExplorerUrl(img.explorerUrl);
        if (!fileId) return null;
        const url = await resolve(fileId);
        if (!url) return null;
        out.push({
          ...img,
          fileId,
          imageUrl: url,
          explorerUrl: toConsoleStorageExplorerUrl(img.explorerUrl),
        });
      }
      return out;
    },
    settle(key: string) {
      this.settledKey = key;
      this.inflightWorkloadId = null;
      this.pending = false;
    },
    async startPoll() {
      const run = this.run as ChatToolRun;
      if (run.tool !== 'generate_image' && run.tool !== 'generate_audio') return;
      const workloadId = parseMediaWorkloadId(run.result) || '';
      const settleKey = `${String(run.id || '')}:${workloadId}:${String(run.status || '')}`;
      if (this.settledKey === settleKey || this.inflightWorkloadId === settleKey) return;

      this.abort?.abort();
      this.inflightWorkloadId = settleKey;
      const ctrl = new AbortController();
      this.abort = ctrl;

      if (run.status === 'error') {
        this.error = run.error || 'Tool failed';
        this.pending = false;
        return;
      }

      const initial = parseMediaImages(run.result);
      const directAudio = parseMediaAudioUrl(run.result);
      if (run.tool === 'generate_image' && initial.length) {
        try {
          const stored = await this.storedFileImages(initial);
          if (ctrl.signal.aborted) return;
          if (stored?.length) {
            this.images = stored;
            this.settle(settleKey);
            return;
          }
        } catch {
          /* workload poll below */
        }
      }
      const needsFileUrl = workloadResultPathsNeedFileUrl(initial);
      if (initial.length && !needsFileUrl) {
        this.images = initial.map((img) => ({
          ...img,
          explorerUrl: toConsoleStorageExplorerUrl(img.explorerUrl),
        }));
        this.settle(settleKey);
        return;
      }
      if (needsFileUrl) {
        this.images = [];
        this.pending = true;
      }
      if (run.tool === 'generate_audio' && directAudio) {
        this.audioUrl = directAudio;
        this.settle(settleKey);
        return;
      }

      const poll = this.pollWorkload as PollFn | null;
      if (!workloadId || !poll) {
        this.pending = run.status === 'running';
        if (run.status !== 'running') this.settledKey = settleKey;
        this.inflightWorkloadId = null;
        return;
      }

      this.pending = true;
      this.error = null;
      try {
        const wl = await poll(workloadId, {
          intervalMs: 2000,
          maxAttempts: 90,
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const status = String(wl.status || '').toLowerCase();
        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          this.error = run.tool === 'generate_audio' ? 'TTS generation failed' : 'Image generation failed';
          this.settle(settleKey);
          return;
        }
        if (run.tool === 'generate_image') {
          const parsed = parseWorkloadMediaImages(wl);
          const stored = await this.storedFileImages(parsed);
          if (ctrl.signal.aborted) return;
          const images = stored?.length ? stored : parsed;
          if (images.length) {
            this.images = images.map((img) => ({
              ...img,
              explorerUrl: toConsoleStorageExplorerUrl(img.explorerUrl),
            }));
          }
        } else {
          const url =
            (typeof wl.resultServeUrl === 'string' && wl.resultServeUrl) ||
            parseMediaAudioUrl(wl);
          if (url) this.audioUrl = url;
        }
        this.settle(settleKey);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const missing =
          (err as { code?: string })?.code === 'WORKLOAD_NOT_FOUND' ||
          /workload not found/i.test(err instanceof Error ? err.message : String(err));
        this.pending = false;
        this.settledKey = settleKey;
        this.error = missing
          ? null
          : err instanceof Error
            ? err.message
            : 'Timed out waiting for media';
      } finally {
        if (this.inflightWorkloadId === settleKey) this.inflightWorkloadId = null;
      }
    },
  },
  render(h: any) {
    const run = this.run as ChatToolRun;
    if (run.tool === 'generate_image') {
      const gridClass =
        this.images.length > 1
          ? 'nexus-media-grid nexus-media-grid--multi'
          : 'nexus-media-grid';
      return h('div', { class: 'nexus-media-tool' }, [
        this.pending
          ? h('div', { class: 'nexus-media-pending text-muted small' }, [
              'Generating image' + (this.images.length !== 1 ? 's' : '') + '…',
            ])
          : null,
        this.error ? h('p', { class: 'text-danger small mb-1' }, this.error) : null,
        this.images.length
          ? h(
              'div',
              { class: gridClass },
              this.images.map((img: any) =>
                h('figure', { key: img.index, class: 'nexus-media-figure' }, [
                  h('img', {
                    attrs: { src: img.imageUrl, alt: img.label },
                    class: 'nexus-media-img',
                  }),
                  h('figcaption', { class: 'small text-muted' }, [
                    h('div', img.label),
                    img.explorerUrl
                      ? h(
                          'a',
                          {
                            attrs: { href: toConsoleStorageExplorerUrl(img.explorerUrl), target: '_blank', rel: 'noopener' },
                            class: 'nexus-explorer-link',
                          },
                          'Open in storage',
                        )
                      : null,
                  ]),
                ]),
              ),
            )
          : null,
      ]);
    }
    if (run.tool === 'generate_audio') {
      return h('div', { class: 'nexus-media-tool' }, [
        this.pending
          ? h('div', { class: 'nexus-media-pending text-muted small' }, 'Generating speech…')
          : null,
        this.error ? h('p', { class: 'text-danger small mb-1' }, this.error) : null,
        this.audioUrl
          ? h('audio', {
              attrs: { controls: true, src: this.audioUrl, preload: 'auto' },
              class: 'nexus-media-audio',
            })
          : null,
      ]);
    }
    return null;
  },
});

export default MediaToolWidget;
