import { describe, expect, it } from 'vitest';
import { TOOL_WIDGET_CSS } from './styles';

/**
 * Regression guard for the portal "Quick response" / ask_user_choice card.
 *
 * The card is rendered by the Vue host (`AskUserChoiceToolWidget`) with
 * Bootstrap `.btn-outline-primary` option buttons. The portal ships a global
 * Paper-Dashboard theme whose `.btn-outline-primary` / `.form-control` / `label`
 * rules painted bright teal option text on the bright card surface
 * ("bright on bright"). The injected tool-widget CSS must therefore own the
 * foreground of the card, its option buttons, and the free-text input.
 */
describe('ask_user_choice card styles', () => {
  it('owns the card foreground color', () => {
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice\s*\{[^}]*color:/);
  });

  it('overrides host .btn-outline-primary inside the options list', () => {
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice__options \.btn-outline-primary\s*\{[^}]*color:/);
    // Selected/active option must stay readable too.
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice__options \.btn-primary\s*\{[^}]*color:/);
  });

  it('keeps disabled option labels muted instead of white', () => {
    const block = TOOL_WIDGET_CSS.match(
      /\.nexus-ask-choice__options \.btn-outline-primary:disabled[^{]*\{([^}]*)\}/,
    );
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/!important/);
  });

  it('themes the free-text answer + persist inputs and placeholders', () => {
    // The input selectors sit in one grouped rule that sets color.
    const group = TOOL_WIDGET_CSS.match(/\.nexus-ask-choice__custom[^{]*\{([^}]*)\}/);
    expect(group).not.toBeNull();
    expect(group![0]).toMatch(/\.nexus-ask-choice__custom \.form-control/);
    expect(group![1]).toMatch(/color:/);
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice__custom \.form-control::placeholder/);
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice__persist-toggle/);
  });

  it('styles the React-parity option row (radio/checkbox + label)', () => {
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice__option\s*\{[^}]*color:/);
    expect(TOOL_WIDGET_CSS).toMatch(/\.nexus-ask-choice__option input\s*\{[^}]*accent-color:/);
  });
});
