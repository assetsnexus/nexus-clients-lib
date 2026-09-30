import { describe, expect, it } from 'vitest';
import {
  HTML_PURIFY_CONFIG,
  sanitizeHtml,
  wrapSanitizedHtmlDocument,
  renderMarkdown,
} from './file-preview-sanitize.js';

function fakePurify() {
  return {
    sanitize(dirty: string, config?: { FORBID_TAGS?: readonly string[] }) {
      let out = String(dirty);
      const forbid = config?.FORBID_TAGS || HTML_PURIFY_CONFIG.FORBID_TAGS;
      for (const tag of forbid) {
        const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>|<${tag}\\b[^>]*\\/?>`, 'gi');
        out = out.replace(re, '');
      }
      out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return out;
    },
  };
}

describe('file-preview-sanitize', () => {
  it('strips script tags', () => {
    const dirty = '<p>hi</p><script>alert(1)</script><img src=x onerror=alert(1)>';
    const clean = sanitizeHtml(dirty, fakePurify());
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).toContain('<p>hi</p>');
  });

  it('wraps sanitized HTML with CSP and no allow-scripts policy in document', () => {
    const doc = wrapSanitizedHtmlDocument('<p>ok</p>');
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain('<p>ok</p>');
  });

  it('renderMarkdown sanitizes parser output', () => {
    const html = renderMarkdown('# Title\n\n<script>x</script>', {
      parse: (src) => `<h1>${src.split('\n')[0]?.replace(/^#\s*/, '')}</h1><script>x</script>`,
      purify: fakePurify(),
    });
    expect(html).toContain('<h1>Title</h1>');
    expect(html).not.toMatch(/script/i);
  });
});
