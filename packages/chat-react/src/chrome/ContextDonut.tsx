import type { ContextDonutModel } from './context-donut.js';

export function ContextDonut({ model }: { model: ContextDonutModel }) {
  return (
    <div className="nexus-chat__donut-wrap">
      <svg viewBox="0 0 42 42" className="nexus-chat__donut" aria-hidden="true">
        <circle className="nexus-chat__donut-ring" cx="21" cy="21" r="15.915" />
        {model.slices.map((slice) => (
          <circle
            key={slice.category}
            className="nexus-chat__donut-segment"
            cx="21"
            cy="21"
            r="15.915"
            stroke={slice.color}
            strokeDasharray={`${slice.pct} ${100 - slice.pct}`}
            strokeDashoffset={slice.offset}
          />
        ))}
      </svg>
      <div className="nexus-chat__donut-center">
        <div className="nexus-chat__donut-pct">{model.pct == null ? '' : `${model.pct}%`}</div>
        {model.tokenLabel && model.tokenLabel !== '—' ? (
          <div className="nexus-chat__muted">{model.tokenLabel}</div>
        ) : null}
      </div>
    </div>
  );
}
