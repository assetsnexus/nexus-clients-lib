import { describe, expect, it } from 'vitest';
import { SCROLLBAR_CSS, TOOL_WIDGET_CSS } from './styles';

/**
 * Regression guard for the shared custom scrollbar on the Vue chat surfaces.
 *
 * The conversation / contacts / rooms lists, the thread, the mention menu and
 * the modals must not fall back to the raw OS bar. They are styled through the
 * injected tool-widget stylesheet (the containers live in several scoped SFCs),
 * so this asserts the treatment, the theming tokens, the Firefox fallback and
 * the no-layout-shift gutter are all present.
 *
 * Assertions target the semantics (root wildcard scope, pseudo-element surface,
 * tokens, `@supports` gating) rather than the exact container class list, so the
 * guard stays valid as surfaces are added or the root selector is tuned.
 */
describe('shared custom scrollbar styles', () => {
  it('is injected with the tool-widget stylesheet', () => {
    // The versioned stylesheet must carry the whole scrollbar block.
    expect(TOOL_WIDGET_CSS).toContain(SCROLLBAR_CSS);
    expect(SCROLLBAR_CSS.length).toBeGreaterThan(500);
  });

  it('scopes the treatment off the panel root and the opt-in class', () => {
    // The panel wildcard is what lets one rule cover every scoped SFC container
    // (messages, sidebar, approvals, mention menu, modal) without a hand-kept
    // class list that drifts from the markup.
    expect(SCROLLBAR_CSS).toMatch(/:is\(\.nexus-chat-panel \*/);
    expect(SCROLLBAR_CSS).toContain('.nx-scroll');
  });

  it('sets the full Chromium/Electron pseudo-element surface', () => {
    expect(SCROLLBAR_CSS).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:/);
    expect(SCROLLBAR_CSS).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:/);
    expect(SCROLLBAR_CSS).toMatch(/::-webkit-scrollbar-corner\s*\{[^}]*background:/);
    expect(SCROLLBAR_CSS).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:/);
  });

  it('provides the Firefox standards fallback, gated behind @supports', () => {
    expect(SCROLLBAR_CSS).toMatch(/scrollbar-width:\s*thin;/);
    expect(SCROLLBAR_CSS).toMatch(/scrollbar-color:\s*var\(--nx-scrollbar-thumb\)/);
    // Chromium >= 121 lets the standard properties win over `::-webkit-scrollbar`,
    // so the fallback MUST be gated or the custom bar silently degrades to a
    // native thin one. Lock the gates in.
    expect(SCROLLBAR_CSS).toMatch(/@supports not selector\(::-webkit-scrollbar\)/);
    expect(SCROLLBAR_CSS).toMatch(/@supports selector\(::-webkit-scrollbar\)/);
  });

  it('reserves the gutter so showing a scrollbar cannot shift the list', () => {
    expect(SCROLLBAR_CSS).toMatch(/scrollbar-gutter:\s*stable;/);
  });

  it('themes the bar from design tokens (no hardcoded colors)', () => {
    expect(SCROLLBAR_CSS).toMatch(/--nx-scrollbar-thumb:\s*var\(\s*--nx-chat-scrollbar-thumb/);
    expect(SCROLLBAR_CSS).toMatch(/--nx-scrollbar-thumb-hover:/);
    // The thumb colour itself must be token-driven, never a literal hex.
    const thumb = SCROLLBAR_CSS.match(/::-webkit-scrollbar-thumb\s*\{([^}]*)\}/);
    expect(thumb).not.toBeNull();
    expect(thumb![1]).toMatch(/background:\s*var\(--nx-scrollbar-thumb\)/);
  });

  it('firms the thumb up on hover', () => {
    expect(SCROLLBAR_CSS).toMatch(/::-webkit-scrollbar-thumb \{ background: var\(--nx-scrollbar-thumb-hover\)/);
  });
});
