import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the shared custom scrollbar in `styles.css`.
 *
 * The conversation / inbox list, the contacts + rooms lists, and every other
 * scrolling chat panel must not fall back to the raw OS bar. The treatment
 * scopes off the chat roots (a wildcard descendant selector) so new containers
 * are covered without a hand-maintained list that could drift, and `.nx-scroll`
 * opts in surfaces rendered outside those roots.
 *
 * Assertions target the semantics (pseudo-element surface, tokens, standards
 * fallback, `@supports` gating, gutter) rather than the exact selector text, so
 * the guard stays valid as the root selector set is tuned.
 */
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('shared custom scrollbar styles', () => {
  it('scopes the treatment off the chat root and the opt-in class', () => {
    // The root wildcard is what makes one rule cover every scroll container.
    expect(css).toMatch(/:is\(\.nexus-chat \*/);
    expect(css).toContain('.nx-scroll');
  });

  it('sets the full Chromium/Electron pseudo-element surface', () => {
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*var\(--nx-scrollbar-size/);
    expect(css).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:\s*var\(--nx-scrollbar-track/);
    expect(css).toMatch(/::-webkit-scrollbar-corner\s*\{[^}]*background:\s*var\(--nx-scrollbar-corner/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*var\(--nx-scrollbar-radius/);
  });

  it('provides the Firefox standards fallback, gated so the paths do not fight', () => {
    expect(css).toMatch(/scrollbar-width:\s*thin;/);
    expect(css).toMatch(/scrollbar-color:\s*var\(\s*--nx-scrollbar-thumb/);
    // Chromium >= 121 lets the standard properties win over `::-webkit-scrollbar`,
    // so the fallback MUST be gated or the custom bar silently degrades to a
    // native thin one. Lock both gates in.
    expect(css).toMatch(/@supports not selector\(::-webkit-scrollbar\)/);
    expect(css).toMatch(/@supports selector\(::-webkit-scrollbar\)/);
  });

  it('themes the bar from the chat tokens (no hardcoded colors)', () => {
    const thumb = css.match(/::-webkit-scrollbar-thumb\s*\{([^}]*)\}/);
    expect(thumb).not.toBeNull();
    expect(thumb![1]).toMatch(/background:\s*var\(\s*--nx-scrollbar-thumb/);
    // Fallbacks must derive from the theme, not a literal colour.
    expect(css).toMatch(/var\(--nx-chat-muted[^)]*\)\s*45%/);
    expect(css).toMatch(/var\(--nx-chat-accent[^)]*\)\s*60%/);
  });

  it('firms the thumb up on hover', () => {
    expect(css).toMatch(/:hover::-webkit-scrollbar-thumb\s*\{[^}]*--nx-scrollbar-thumb-hover/);
  });

  it('reserves the gutter on the vertical list surfaces only', () => {
    expect(css).toMatch(/scrollbar-gutter:\s*stable;/);
    // The gutter block must not name the horizontal strips (a phantom gutter
    // under a sideways row is pure noise).
    const gutterBlocks = [...css.matchAll(/([^{}]+)\{[^}]*scrollbar-gutter:\s*stable;/g)];
    expect(gutterBlocks.length).toBeGreaterThan(0);
    const gutterSelectors = gutterBlocks.map((m) => m[1]).join(' ');
    expect(gutterSelectors).not.toContain('.nexus-chat__identity-row');
    expect(gutterSelectors).not.toContain('.nexus-chat__media-strip');
  });
});
