/** Hardcoded portrait/avatar prompt examples for the dialog random button. */
export const MEDIA_GENERATION_PROMPT_EXAMPLES: readonly string[] = [
  'Head-and-shoulders portrait of a kindly lighthouse keeper in a weathered navy peacoat and wool cap, warm golden-hour light, soft coastal background',
  'Portrait of a Byzantine scribe in embroidered indigo robes with a gold-trimmed stole, calm expression, illustrated style, candlelit scriptorium blur',
  'Stylized portrait of a master tea merchant wearing a patterned silk waistcoat and round spectacles, cozy shop interior, soft window light',
  'Portrait of a Roman mosaic artisan in a linen tunic and leather apron, clay-dusted hands folded, ancient workshop background',
  'Head-and-shoulders portrait of a jazz-age archivist in a tweed blazer and silk cravat, art deco office, warm film lighting',
] as const;

export function pickRandomMediaPromptExample(): string {
  const index = Math.floor(Math.random() * MEDIA_GENERATION_PROMPT_EXAMPLES.length);
  return MEDIA_GENERATION_PROMPT_EXAMPLES[index] ?? MEDIA_GENERATION_PROMPT_EXAMPLES[0]!;
}
