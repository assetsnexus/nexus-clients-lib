import {
  parseMediaAudioUrl,
  parseMediaImages,
  parseMediaWorkloadId,
  parseWorkloadMediaImages,
  type ChatToolRun,
} from '@nexus/chat-core';

type PollFn = (
  workloadId: string,
  opts?: { intervalMs?: number; maxAttempts?: number; signal?: AbortSignal },
) => Promise<Record<string, unknown>>;

/**
 * Media carousel for generate_image / generate_audio (Vue 2 Options API).
 * Polls via injected pollWorkload when result only has workloadId.
 */
export const MediaToolWidget = {
  name: 'NexusMediaToolWidget',
  props: {
    run: { type: Object, required: true },
    pollWorkload: { type: Function, default: null },
  },
  data() {
    const run = this.run as ChatToolRun;
    return {
      images: parseMediaImages(run.result),
      audioUrl: parseMediaAudioUrl(run.result),
      pending: run.status === 'running',
      error: (run.error || null) as string | null,
      abort: null as AbortController | null,
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
    async startPoll() {
      const run = this.run as ChatToolRun;
      if (run.tool !== 'generate_image' && run.tool !== 'generate_audio') return;
      this.abort?.abort();
      const ctrl = new AbortController();
      this.abort = ctrl;

      if (run.status === 'error') {
        this.error = run.error || 'Tool failed';
        this.pending = false;
        return;
      }

      const initial = parseMediaImages(run.result);
      const directAudio = parseMediaAudioUrl(run.result);
      if (initial.length) {
        this.images = initial;
        this.pending = false;
        return;
      }
      if (run.tool === 'generate_audio' && directAudio) {
        this.audioUrl = directAudio;
        this.pending = false;
        return;
      }

      const workloadId = parseMediaWorkloadId(run.result);
      const poll = this.pollWorkload as PollFn | null;
      if (!workloadId || !poll) {
        this.pending = run.status === 'running';
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
          this.pending = false;
          return;
        }
        if (run.tool === 'generate_image') {
          const parsed = parseWorkloadMediaImages(wl);
          if (parsed.length) this.images = parsed;
        } else {
          const url =
            (typeof wl.resultServeUrl === 'string' && wl.resultServeUrl) ||
            parseMediaAudioUrl(wl);
          if (url) this.audioUrl = url;
        }
        this.pending = false;
      } catch (err) {
        if (ctrl.signal.aborted) return;
        this.error = err instanceof Error ? err.message : 'Timed out waiting for media';
        this.pending = false;
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
                            attrs: { href: img.explorerUrl, target: '_blank', rel: 'noopener' },
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
};

export default MediaToolWidget;
