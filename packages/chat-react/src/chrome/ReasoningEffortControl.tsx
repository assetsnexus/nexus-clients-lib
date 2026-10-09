import type { ReasoningEffortLevel } from '@nexus/chat-core';

/**
 * Same effort scale the portal chat uses (`ReasoningEffortSelector`):
 * none / minimal / low / medium / high / xhigh, limited to the selected model's levels.
 * Hidden when the model does not support reasoning.
 */
export function ReasoningEffortControl({
  levels,
  value,
  onChange,
}: {
  levels: readonly ReasoningEffortLevel[] | null;
  value: ReasoningEffortLevel | null;
  onChange: (next: ReasoningEffortLevel | null) => void;
}) {
  if (!levels?.length) return null;
  return (
    <label className="nexus-chat__reasoning">
      <span className="nexus-chat__sr">Reasoning effort</span>
      <select
        aria-label="Reasoning effort"
        data-nexus-reasoning=""
        value={value && levels.includes(value) ? value : ''}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next ? (next as ReasoningEffortLevel) : null);
        }}
      >
        <option value="">Default</option>
        {levels.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
    </label>
  );
}
