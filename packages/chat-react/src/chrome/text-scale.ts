/**
 * Chat text scale (`-a` / `+A`) for the shared chat surface.
 *
 * One persisted integer delta drives a single CSS variable on the chat root, so
 * every descendant (bubbles, list rows, composer) scales together instead of
 * each component re-deriving its own font size. The step matches the portal's
 * reader/accessibility ladder (0.125rem per notch) and the delta is clamped to
 * a readable range.
 */

export const CHAT_TEXT_SCALE_STEP_REM = 0.125;
export const CHAT_TEXT_SCALE_MIN = -2;
export const CHAT_TEXT_SCALE_MAX = 3;

const STORAGE_KEY = 'anx-chat-text-scale-delta';

export function clampTextScaleDelta(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(CHAT_TEXT_SCALE_MIN, Math.min(CHAT_TEXT_SCALE_MAX, Math.round(delta)));
}

/** Multiplier applied to `--nx-chat-font-size`. 0 delta is exactly 1. */
export function textScaleMultiplier(delta: number): number {
  return 1 + clampTextScaleDelta(delta) * CHAT_TEXT_SCALE_STEP_REM;
}

/** CSS custom property value for the chat root, or null at the default size. */
export function textScaleFontSize(delta: number, base = '14px'): string | null {
  const clamped = clampTextScaleDelta(delta);
  if (clamped === 0) return null;
  return `calc(${base} * ${textScaleMultiplier(clamped)})`;
}

export function readTextScaleDelta(fallback = 0): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return clampTextScaleDelta(fallback);
    return clampTextScaleDelta(Number(raw));
  } catch {
    return clampTextScaleDelta(fallback);
  }
}

export function writeTextScaleDelta(delta: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampTextScaleDelta(delta)));
  } catch {
    /* private mode / storage disabled */
  }
}

/** Apply the scale to a chat root element; clears it at delta 0. */
export function applyTextScaleToElement(el: HTMLElement | null, delta: number): void {
  if (!el) return;
  const next = textScaleFontSize(delta);
  if (next) el.style.setProperty('--nx-chat-font-size', next);
  else el.style.removeProperty('--nx-chat-font-size');
}
