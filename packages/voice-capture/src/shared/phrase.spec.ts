import { describe, expect, it } from 'vitest';
import {
  annotateTranscriptTokens,
  firstMatchingPhraseIndex,
  normalizePhraseText,
  transcriptAddressesPhrase,
} from './phrase.js';

describe('normalizePhraseText', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalizePhraseText('  Jose,  Hello!! ').text).toBe('jose hello');
  });
  it('returns no tokens for punctuation only', () => {
    expect(normalizePhraseText('  ...  ').tokens).toEqual([]);
  });
});

describe('transcriptAddressesPhrase', () => {
  it('matches a whole word', () => {
    expect(transcriptAddressesPhrase('Bob, do this', 'bob')).toBe(true);
  });
  it('does not match a substring', () => {
    expect(transcriptAddressesPhrase('a bobcat appeared', 'bob')).toBe(false);
  });
  it('matches a multi-word phrase', () => {
    expect(transcriptAddressesPhrase('hey bob are you there', 'hey bob')).toBe(true);
  });
  it('rejects an out-of-order phrase', () => {
    expect(transcriptAddressesPhrase('hey there bob', 'hey bob')).toBe(false);
  });
  it('is case/punctuation tolerant', () => {
    expect(transcriptAddressesPhrase('HEY, Bob!', 'hey bob')).toBe(true);
  });
  it('rejects an empty phrase', () => {
    expect(transcriptAddressesPhrase('anything', '   ')).toBe(false);
  });
});

describe('firstMatchingPhraseIndex', () => {
  it('prefers the longest matching phrase', () => {
    expect(firstMatchingPhraseIndex('hey bob please', ['bob', 'hey bob'])).toBe(1);
  });
  it('returns -1 when nothing matches', () => {
    expect(firstMatchingPhraseIndex('hello world', ['bob', 'alice'])).toBe(-1);
  });
});

describe('annotateTranscriptTokens', () => {
  it('flags the words inside a matched phrase', () => {
    expect(annotateTranscriptTokens('Hey Bob, do this', ['hey bob'])).toEqual([
      { text: 'Hey', wake: true },
      { text: 'Bob,', wake: true },
      { text: 'do', wake: false },
      { text: 'this', wake: false },
    ]);
  });
  it('flags a mid-sentence match', () => {
    const tokens = annotateTranscriptTokens('please hey jarvis now', ['hey jarvis']);
    expect(tokens.filter((t) => t.wake).map((t) => t.text)).toEqual(['hey', 'jarvis']);
  });
  it('does not flag a substring', () => {
    expect(annotateTranscriptTokens('a bobcat appeared', ['bob']).some((t) => t.wake)).toBe(false);
  });
  it('drops punctuation-only words', () => {
    expect(annotateTranscriptTokens('hello -- world', ['bob']).map((t) => t.text)).toEqual([
      'hello',
      'world',
    ]);
  });
  it('returns an empty list for empty text', () => {
    expect(annotateTranscriptTokens('   ', ['bob'])).toEqual([]);
  });
});
