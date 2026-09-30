export const PREVIEW_KIND = Object.freeze({
  TEXT: 'text',
  MARKDOWN: 'markdown',
  HTML: 'html',
  PDF: 'pdf',
  IMAGE: 'image',
  OFFICE_WORD: 'office-word',
  OFFICE_SHEET: 'office-sheet',
  OFFICE_SLIDE: 'office-slide',
  OTHER: 'other',
} as const);

export type PreviewKind = (typeof PREVIEW_KIND)[keyof typeof PREVIEW_KIND];

const IMAGE_RE = /^image\//;
const PDF_RE = /^application\/pdf$/;
const HTML_RE = /^(text\/html|application\/xhtml\+xml)$/;
const MARKDOWN_RE = /^(text\/markdown|text\/x-markdown)$/;
const TEXT_RE = /^(text\/|application\/(json|xml|javascript|x-javascript|csv|x-yaml|toml))/;

const WORD_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.oasis.opendocument.text',
]);
const SHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
]);
const SLIDE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
]);

export function detectPreviewKind(contentType: string | null | undefined, name: string | null | undefined): PreviewKind {
  const ct = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const fileName = String(name || '');

  if (IMAGE_RE.test(ct) || /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(fileName)) {
    return PREVIEW_KIND.IMAGE;
  }
  if (PDF_RE.test(ct) || /\.pdf$/i.test(fileName)) return PREVIEW_KIND.PDF;
  if (HTML_RE.test(ct) || /\.html?$/i.test(fileName)) return PREVIEW_KIND.HTML;
  if (MARKDOWN_RE.test(ct) || /\.md$/i.test(fileName)) return PREVIEW_KIND.MARKDOWN;
  if (WORD_TYPES.has(ct) || /\.(docx|doc|odt)$/i.test(fileName)) return PREVIEW_KIND.OFFICE_WORD;
  if (SHEET_TYPES.has(ct) || /\.(xlsx|xls|ods|csv)$/i.test(fileName)) {
    if (ct === 'text/csv' || /\.csv$/i.test(fileName)) return PREVIEW_KIND.TEXT;
    return PREVIEW_KIND.OFFICE_SHEET;
  }
  if (SLIDE_TYPES.has(ct) || /\.(pptx|ppt|odp)$/i.test(fileName)) return PREVIEW_KIND.OFFICE_SLIDE;
  if (
    TEXT_RE.test(ct) ||
    /\.(txt|json|csv|xml|log|ya?ml|js|mjs|cjs|ts|tsx|jsx|css|vue|toml|py|sh|bash|rb|go|rs|java|c|cpp|h|hpp)$/i.test(
      fileName,
    )
  ) {
    return PREVIEW_KIND.TEXT;
  }
  return PREVIEW_KIND.OTHER;
}
