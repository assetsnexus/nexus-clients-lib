/**
 * Merge host prefill text into the existing composer draft.
 * Does not send. A non-empty draft gets a single leading space when it
 * does not already end in whitespace.
 */
export function appendComposerDraft(current: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  return /\s$/.test(current) ? `${current}${next}` : `${current} ${next}`;
}
