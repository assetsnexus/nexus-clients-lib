/**
 * Wake-phrase text matching (shared, pure).
 *
 * A voice surface that transcribes gated speech on-device still has to decide
 * whether the transcript *addressed* an agent. Speech recognition is noisy, so
 * matching is deliberately forgiving about punctuation, case, extra whitespace
 * and filler words, while staying strict about *which* words matched: a phrase
 * only fires as a whole-word (or whole-word-sequence) hit, never as a substring
 * buried inside another word.
 *
 *   phrase "bob"   matches  "Bob, do this"        -> yes
 *                  matches  "bobcat spotted"      -> no  (substring, not a word)
 *                  matches  "page the bob team"   -> yes
 *   phrase "hey bob" matches"hey bob are you there"-> yes
 *
 * Pure and dependency-free so both the detector and unit tests share it.
 */

/**
 * Normalize transcript/phrase text for matching: lowercase, strip diacritics,
 * turn any non-alphanumeric run into a single space, and collapse whitespace.
 * Returns the normalized string plus its token list.
 */
export function normalizePhraseText(raw: string): { text: string; tokens: string[] } {
  const text = (raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // Drop combining marks so "Jose" matches "jose".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return { text, tokens: text ? text.split(' ') : [] };
}

/**
 * True when `phrase` occurs in `transcript` as a contiguous whole-word sequence.
 * The phrase may be multi-word ("hey bob"); a single-word phrase never matches
 * inside a longer word.
 */
export function transcriptAddressesPhrase(transcript: string, phrase: string): boolean {
  const p = normalizePhraseText(phrase);
  if (!p.tokens.length) return false;
  const t = normalizePhraseText(transcript);
  if (t.tokens.length < p.tokens.length) return false;
  for (let i = 0; i + p.tokens.length <= t.tokens.length; i++) {
    let hit = true;
    for (let j = 0; j < p.tokens.length; j++) {
      if (t.tokens[i + j] !== p.tokens[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Find which of several phrases a transcript addresses, best (longest phrase)
 * first so a two-word phrase wins over a single-word one that is a subset of it.
 * Returns the matching index, or -1.
 */
export function firstMatchingPhraseIndex(
  transcript: string,
  phrases: readonly string[],
): number {
  let best = -1;
  let bestWords = -1;
  for (let i = 0; i < phrases.length; i++) {
    const words = normalizePhraseText(phrases[i]!).tokens.length;
    if (words === 0) continue;
    if (!transcriptAddressesPhrase(transcript, phrases[i]!)) continue;
    if (words > bestWords) {
      bestWords = words;
      best = i;
    }
  }
  return best;
}

/** One display token of a live transcript; `wake` is true inside a matched phrase. */
export type TranscriptToken = { text: string; wake: boolean };

/**
 * Split a transcript into display words and flag those that fall inside any
 * matched phrase, so the UI can highlight the wake word in the live caption.
 *
 * The original word is preserved for display (casing/punctuation kept); matching
 * runs on normalized tokens so "Bob," still matches the phrase "bob" and a
 * multi-word phrase highlights every word it spans. Words that normalize to
 * nothing (pure punctuation) are dropped from the visible caption.
 */
export function annotateTranscriptTokens(
  transcript: string,
  phrases: readonly string[],
): TranscriptToken[] {
  const raws = (transcript ?? '').split(/\s+/).filter(Boolean);
  // Flatten each raw word into its normalized tokens, remembering which raw word
  // each normalized token came from so a match maps back to a display word.
  const normTokens: string[] = [];
  const normToRaw: number[] = [];
  raws.forEach((raw, index) => {
    for (const token of normalizePhraseText(raw).tokens) {
      normTokens.push(token);
      normToRaw.push(index);
    }
  });
  const wake = new Array<boolean>(raws.length).fill(false);
  for (const phrase of phrases) {
    const p = normalizePhraseText(phrase).tokens;
    if (!p.length) continue;
    for (let i = 0; i + p.length <= normTokens.length; i++) {
      let hit = true;
      for (let j = 0; j < p.length; j++) {
        if (normTokens[i + j] !== p[j]) {
          hit = false;
          break;
        }
      }
      if (!hit) continue;
      for (let j = 0; j < p.length; j++) wake[normToRaw[i + j]!] = true;
    }
  }
  const out: TranscriptToken[] = [];
  raws.forEach((raw, index) => {
    if (!normalizePhraseText(raw).tokens.length) return; // drop punctuation-only
    out.push({ text: raw, wake: wake[index]! });
  });
  return out;
}
