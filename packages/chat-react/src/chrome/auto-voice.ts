/**
 * Auto-voice preference: when on, a finished assistant turn is synthesised and
 * played without a click.
 *
 * The flag is a single persisted boolean shared by every composer instance, so
 * the toggle survives reloads and stays consistent across panels. Storage
 * failures (private mode, blocked storage) degrade to the in-memory value.
 */

const STORAGE_KEY = 'anx-chat-auto-voice';

export function readAutoVoice(fallback = false): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

export function writeAutoVoice(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* private mode / storage disabled */
  }
}

/**
 * Turn key for the spoken-turn guard: assistant text is spoken once per turn,
 * so a re-render (or a history rehydrate) must never replay audio the user
 * already heard. Falls back to a text slice when the turn has no id.
 */
export function spokenTurnKey(turn: { id?: string | null; role?: string | null; text?: string | null }): string {
  const id = (turn.id || '').trim();
  if (id) return id;
  return `${turn.role || 'assistant'}:${(turn.text || '').slice(0, 64)}`;
}
