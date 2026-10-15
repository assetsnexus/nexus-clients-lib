import type { ReasoningEffortLevel } from '@nexus/chat-core';
import { coerceReasoningEffort, reasoningEffortLabel, reasoningSliderStops } from './reasoning-slider.js';

/**
 * Reasoning effort slider. Stops are low / high / xhigh when the model allows them.
 * Hidden only when a selected model does not support reasoning (`levels` is empty).
 * `levels === null` is the agent default: the full scale, with the highest stop selected.
 */
export function ReasoningEffortControl({
  levels,
  value,
  onChange,
}: {
  levels: readonly ReasoningEffortLevel[] | null;
  value: ReasoningEffortLevel | null;
  onChange: (next: ReasoningEffortLevel) => void;
}) {
  if (levels && !levels.length) return null;
  const stops = reasoningSliderStops(levels);
  const selected = coerceReasoningEffort(value, levels);
  const index = Math.max(0, stops.indexOf(selected));
  return (
    <div className="nexus-chat__reasoning">
      <div className="nexus-chat__reasoning-head">
        <span>Reasoning</span>
        <span data-nexus-reasoning="">{reasoningEffortLabel(selected)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, stops.length - 1)}
        step={1}
        value={index}
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, stops.length - 1)}
        aria-valuenow={index}
        aria-valuetext={reasoningEffortLabel(selected)}
        data-nexus-reasoning=""
        onChange={(event) => {
          const next = stops[Number(event.target.value)];
          if (next) onChange(next);
        }}
      />
      <div className="nexus-chat__reasoning-stops">
        {stops.map((stop) => (
          <span key={stop} className={stop === selected ? 'is-active' : undefined}>
            {reasoningEffortLabel(stop)}
          </span>
        ))}
      </div>
    </div>
  );
}
