/**
 * HTML / Markdown sanitization for the in-app viewer.
 * Mirrors portal `file-preview-sanitize.util.js`. Never eval.
 */

export const HTML_PURIFY_CONFIG = Object.freeze({
  USE_PROFILES: { html: true },
  FORBID_TAGS: Object.freeze([
    'script',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'input',
    'button',
    'textarea',
    'select',
  ]),
  FORBID_ATTR: Object.freeze([
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'onfocus',
    'onblur',
    'onchange',
    'onsubmit',
    'onanimationstart',
    'onpointerenter',
  ]),
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
});

export const HTML_VIEWER_CSP =
  "default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export type PurifyLike = { sanitize: (dirty: string, config?: any) => string };

export function resolvePurify(injected?: PurifyLike | null): PurifyLike | null {
  if (injected && typeof injected.sanitize === 'function') return injected;
  return null;
}

export function sanitizeHtml(dirty: unknown, purify?: PurifyLike | null): string {
  const impl = resolvePurify(purify);
  const source = String(dirty == null ? '' : dirty);
  if (!impl || typeof impl.sanitize !== 'function') {
    throw new Error('DOMPurify is required to render HTML');
  }
  return String(impl.sanitize(source, HTML_PURIFY_CONFIG) || '');
}

export function wrapSanitizedHtmlDocument(safeBodyHtml: string): string {
  const body = String(safeBodyHtml || '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${HTML_VIEWER_CSP}"></head><body>${body}</body></html>`;
}

export function renderMarkdown(
  source: unknown,
  deps: { parse: (src: string) => string; purify?: PurifyLike | null },
): string {
  if (typeof deps.parse !== 'function') {
    throw new Error('Markdown parser is required');
  }
  const parsed = deps.parse(String(source || ''));
  const html = typeof parsed === 'string' ? parsed : '';
  return sanitizeHtml(html, deps.purify);
}

export function normalizeSheetView(raw: Record<string, unknown> = {}): {
  sheetName: string;
  rows: unknown[][];
  sheets: Array<{ name?: string } | string>;
} {
  const named = Array.isArray(raw.sheets)
    ? (raw.sheets as Array<{ name?: string } | string>)
    : Array.isArray(raw.SheetNames)
      ? (raw.SheetNames as string[]).map((name) => ({ name }))
      : [];
  let rows: unknown = raw.rows || raw.data || raw.values;
  if (!rows && Array.isArray(raw.sheets) && raw.sheets[0] && Array.isArray((raw.sheets[0] as { rows?: unknown }).rows)) {
    rows = (raw.sheets[0] as { rows: unknown[][] }).rows;
  }
  const sheetName =
    (typeof raw.sheetName === 'string' && raw.sheetName) ||
    (typeof raw.name === 'string' && raw.name) ||
    (named[0] && (typeof named[0] === 'string' ? named[0] : named[0].name)) ||
    'Sheet';
  return {
    sheetName: String(sheetName),
    rows: Array.isArray(rows) ? (rows as unknown[][]) : [],
    sheets: named,
  };
}
