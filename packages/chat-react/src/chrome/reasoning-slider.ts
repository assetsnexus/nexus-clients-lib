import type { ReasoningEffortLevel } from '@nexus/chat-core';

/** Stops the chat slider exposes. Highest is the default. */
export const REASONING_SLIDER_STOPS: readonly ReasoningEffortLevel[] = ['low', 'high', 'xhigh'];

/**
 * Slider stops for a model.
 * `null` means no model is selected yet, so the full low / high / xhigh scale is shown.
 * A non-empty level list is intersected with that scale. When the model supports
 * reasoning but none of those three, its own levels are used so the control still works.
 */
export function reasoningSliderStops(
  levels: readonly ReasoningEffortLevel[] | null | undefined,
): ReasoningEffortLevel[] {
  if (!levels?.length) return [...REASONING_SLIDER_STOPS];
  const preferred = REASONING_SLIDER_STOPS.filter((stop) => levels.includes(stop));
  return preferred.length ? [...preferred] : [...levels];
}

export function reasoningEffortLabel(level: ReasoningEffortLevel): string {
  if (level === 'xhigh') return 'xHigh';
  if (level === 'none') return 'None';
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/** Keep the current stop when it is valid. Otherwise use the highest stop. */
export function coerceReasoningEffort(
  current: ReasoningEffortLevel | null | undefined,
  levels: readonly ReasoningEffortLevel[] | null | undefined,
): ReasoningEffortLevel {
  const stops = reasoningSliderStops(levels);
  if (current && stops.includes(current)) return current;
  return stops[stops.length - 1];
}
