import {
  parsePresentFileItems,
  presentFileKind,
  type ChatToolRun,
  type PresentFileItem,
} from '@nexus/chat-core';

function explorerHref(file: PresentFileItem): string | null {
  return file.explorerUrl;
}

/**
 * present_file / present_files cards with storage explorer deep-link.
 */
export const StorageFileToolWidget = {
  name: 'NexusStorageFileToolWidget',
  props: {
    run: { type: Object, required: true },
  },
  data() {
    return { expanded: true, lightboxUrl: null as string | null };
  },
  computed: {
    files(): PresentFileItem[] {
      return parsePresentFileItems((this.run as ChatToolRun).result);
    },
    isMulti(): boolean {
      const run = this.run as ChatToolRun;
      return run.tool === 'present_files' || this.files.length > 1;
    },
    headerLabel(): string {
      if (this.isMulti) return `${this.files.length} files`;
      return this.files[0]?.label || 'File';
    },
  },
  methods: {
    renderFile(h: any, file: PresentFileItem) {
      const kind = presentFileKind(file.mimeType, file.label);
      const url = file.presignedUrl;
      const link = explorerHref(file)
        ? h(
            'a',
            {
              attrs: { href: explorerHref(file)!, target: '_blank', rel: 'noopener' },
              class: 'nexus-explorer-link small',
            },
            'Open in storage',
          )
        : null;

      if (!url) {
        return h('div', { class: 'nexus-file-card p-2' }, [
          h('div', { class: 'font-weight-bold small text-truncate' }, file.label),
          h('div', { class: 'text-muted small' }, file.mimeType),
          link,
        ]);
      }

      if (file.displayMode !== 'download' && kind === 'image') {
        return h('div', { class: 'nexus-file-card' }, [
          h('img', {
            attrs: { src: url, alt: file.label },
            class: 'nexus-file-thumb',
            on: { click: () => (this.lightboxUrl = url) },
          }),
          h('div', { class: 'p-2 d-flex justify-content-between align-items-center' }, [
            h('span', { class: 'small text-truncate' }, file.label),
            link,
          ]),
        ]);
      }
      if (file.displayMode !== 'download' && kind === 'audio') {
        return h('div', { class: 'nexus-file-card p-2' }, [
          h('div', { class: 'small font-weight-bold mb-1' }, file.label),
          h('audio', { attrs: { controls: true, src: url, preload: 'metadata' }, class: 'w-100' }),
          link,
        ]);
      }
      if (file.displayMode !== 'download' && kind === 'video') {
        return h('div', { class: 'nexus-file-card' }, [
          h('video', {
            attrs: { controls: true, src: url, preload: 'metadata' },
            class: 'nexus-file-video',
          }),
          h('div', { class: 'p-2 d-flex justify-content-between' }, [
            h('span', { class: 'small' }, file.label),
            link,
          ]),
        ]);
      }
      return h('div', { class: 'nexus-file-card p-2' }, [
        h('div', { class: 'font-weight-bold small' }, file.label),
        h('div', { class: 'text-muted small mb-1' }, file.mimeType),
        h(
          'a',
          { attrs: { href: url, target: '_blank', rel: 'noopener' }, class: 'small' },
          kind === 'pdf' ? 'Open PDF' : 'Download',
        ),
        h('div', { class: 'mt-1' }, [link]),
      ]);
    },
  },
  render(h: any) {
    const run = this.run as ChatToolRun;
    if (!this.files.length) {
      return h('div', { class: 'nexus-file-tool text-muted small p-2' }, [
        `No file metadata returned from ${run.tool}.`,
      ]);
    }
    return h('div', { class: 'nexus-file-tool' }, [
      h(
        'button',
        {
          class: 'nexus-file-tool__header btn btn-link btn-sm btn-block text-left',
          attrs: { type: 'button', 'aria-expanded': String(this.expanded) },
          on: { click: () => (this.expanded = !this.expanded) },
        },
        [
          h('span', { class: 'font-weight-bold' }, this.headerLabel),
          h('span', { class: 'text-muted small ml-2' }, run.status),
          h('span', { class: 'float-right' }, this.expanded ? '▾' : '▸'),
        ],
      ),
      this.expanded
        ? h(
            'div',
            {
              class: this.isMulti
                ? 'nexus-file-tool__grid'
                : 'nexus-file-tool__single',
            },
            this.files.map((file: PresentFileItem, i: number) =>
              h('div', { key: `${file.fileId || file.objectKey || file.label}-${i}` }, [
                this.renderFile(h, file),
              ]),
            ),
          )
        : null,
      this.lightboxUrl
        ? h(
            'div',
            {
              class: 'nexus-file-lightbox',
              on: { click: () => (this.lightboxUrl = null) },
            },
            [
              h('img', {
                attrs: { src: this.lightboxUrl, alt: 'Preview' },
                class: 'nexus-file-lightbox__img',
              }),
            ],
          )
        : null,
    ]);
  },
};

export default StorageFileToolWidget;
