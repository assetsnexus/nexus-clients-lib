import type { PurifyLike } from './file-preview-sanitize.js';
import {
  normalizeSheetView,
  sanitizeHtml,
  wrapSanitizedHtmlDocument,
  renderMarkdown,
} from './file-preview-sanitize.js';
import { PREVIEW_KIND, detectPreviewKind, type PreviewKind } from './preview-kind.js';

export type ViewerFileRef = {
  id: string;
  name: string;
  mimeType?: string | null;
  url?: string | null;
  downloadUrl?: string | null;
};

export type LoadedPreview =
  | { kind: 'image'; objectUrl: string }
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; html: string }
  | { kind: 'html'; srcdoc: string }
  | { kind: 'office-word'; srcdoc: string }
  | { kind: 'office-sheet'; sheetName: string; rows: unknown[][]; sheets: string[] }
  | { kind: 'office-slide'; slides: Array<{ index: number; text: string; images: string[] }>; downloadUrl: string | null }
  | { kind: 'pdf'; objectUrl: string }
  | { kind: 'other'; downloadUrl: string | null; message: string };

const MAX_TEXT_CHARS = 200_000;

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<a:t[^>]*>/g, '')
    .replace(/<\/a:t>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadPptxSlides(buffer: ArrayBuffer): Promise<Array<{ index: number; text: string; images: string[] }>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
      return na - nb;
    });
  const mediaImages: string[] = [];
  const media = Object.keys(zip.files).filter((p) => p.startsWith('ppt/media/'));
  for (const mediaPath of media.slice(0, 12)) {
    const blob = await zip.file(mediaPath)!.async('blob');
    if (blob.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|emf|wmf)$/i.test(mediaPath)) {
      if (/\.(png|jpe?g|gif|webp)$/i.test(mediaPath) || blob.type.startsWith('image/')) {
        mediaImages.push(URL.createObjectURL(blob));
      }
    }
  }
  const slides: Array<{ index: number; text: string; images: string[] }> = [];
  for (let i = 0; i < slideFiles.length; i += 1) {
    const path = slideFiles[i]!;
    const xml = await zip.file(path)!.async('string');
    const text = stripXmlTags(xml);
    slides.push({ index: i + 1, text, images: i === 0 ? mediaImages : [] });
  }
  return slides;
}

export async function loadViewerPreview(
  file: ViewerFileRef,
  deps: { purify: PurifyLike; parseMarkdown: (src: string) => string },
): Promise<LoadedPreview> {
  const kind: PreviewKind = detectPreviewKind(file.mimeType, file.name);
  const url = file.url || file.downloadUrl || null;
  if (!url && kind !== PREVIEW_KIND.OTHER) {
    return { kind: 'other', downloadUrl: null, message: 'No URL available for this file.' };
  }

  if (kind === PREVIEW_KIND.IMAGE && url) {
    return { kind: 'image', objectUrl: url };
  }

  if (kind === PREVIEW_KIND.PDF && url) {
    return { kind: 'pdf', objectUrl: url };
  }

  if (!url) {
    return { kind: 'other', downloadUrl: null, message: 'No preview available.' };
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }
  const buffer = await res.arrayBuffer();

  if (kind === PREVIEW_KIND.TEXT) {
    const text = new TextDecoder().decode(buffer).slice(0, MAX_TEXT_CHARS);
    return { kind: 'text', text };
  }

  if (kind === PREVIEW_KIND.MARKDOWN) {
    const source = new TextDecoder().decode(buffer).slice(0, MAX_TEXT_CHARS);
    const html = renderMarkdown(source, { parse: deps.parseMarkdown, purify: deps.purify });
    return { kind: 'markdown', html };
  }

  if (kind === PREVIEW_KIND.HTML) {
    const dirty = new TextDecoder().decode(buffer).slice(0, MAX_TEXT_CHARS);
    const safe = sanitizeHtml(dirty, deps.purify);
    return { kind: 'html', srcdoc: wrapSanitizedHtmlDocument(safe) };
  }

  if (kind === PREVIEW_KIND.OFFICE_WORD) {
    const mammothMod = await import('mammoth');
    const impl = (mammothMod as unknown as { default?: { convertToHtml: typeof mammothMod.convertToHtml } })
      .default || mammothMod;
    const result = await impl.convertToHtml({ arrayBuffer: buffer });
    const safe = sanitizeHtml(result?.value || '', deps.purify);
    return { kind: 'office-word', srcdoc: wrapSanitizedHtmlDocument(safe) };
  }

  if (kind === PREVIEW_KIND.OFFICE_SHEET) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetNames = workbook.SheetNames || [];
    const first = sheetNames[0];
    const sheet = first ? workbook.Sheets[first] : null;
    const rows = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]) : [];
    const view = normalizeSheetView({
      sheetName: first || 'Sheet',
      rows,
      sheets: sheetNames.map((name) => ({ name })),
    });
    return {
      kind: 'office-sheet',
      sheetName: view.sheetName,
      rows: view.rows,
      sheets: sheetNames,
    };
  }

  if (kind === PREVIEW_KIND.OFFICE_SLIDE) {
    try {
      const slides = await loadPptxSlides(buffer);
      return { kind: 'office-slide', slides, downloadUrl: url };
    } catch {
      return {
        kind: 'other',
        downloadUrl: url,
        message: 'PowerPoint preview unavailable. Download the file instead (macros are never executed).',
      };
    }
  }

  return {
    kind: 'other',
    downloadUrl: url,
    message: 'Preview not available for this file type.',
  };
}
