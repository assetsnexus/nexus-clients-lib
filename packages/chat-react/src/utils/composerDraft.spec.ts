import { describe, expect, it } from 'vitest';
import { appendComposerDraft } from './composerDraft.js';

describe('appendComposerDraft', () => {
  it('sets an empty draft', () => {
    expect(appendComposerDraft('', '  hello  ')).toBe('hello');
    expect(appendComposerDraft('   ', 'hello')).toBe('hello');
  });

  it('appends with one leading space when the draft has no trailing space', () => {
    expect(appendComposerDraft('draft', 'more')).toBe('draft more');
  });

  it('does not add a second space when the draft already ends with whitespace', () => {
    expect(appendComposerDraft('draft ', 'more')).toBe('draft more');
    expect(appendComposerDraft('draft\n', 'more')).toBe('draft\nmore');
  });

  it('leaves the draft unchanged for empty incoming text', () => {
    expect(appendComposerDraft('draft', '   ')).toBe('draft');
  });
});
