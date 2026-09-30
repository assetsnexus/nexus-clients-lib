import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PickerModel } from '../models/picker-types.js';
import { formatCreditsPerM, formatIntelScore, formatUsdPerM, intelTone, priceTone } from '../models/intel.js';
import {
  modelDisplayName,
  readRecentModelIds,
  rememberModelUsage,
  resolveModelProvider,
} from '../models/providerMark.js';

export type ModelPickerProps = {
  models: PickerModel[];
  value: string | null;
  loading?: boolean;
  disabled?: boolean;
  onChange: (modelId: string | null) => void;
};

export function ModelPicker({ models, value, loading, disabled, onChange }: ModelPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0, width: 520 });
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    typeof localStorage === 'undefined' ? [] : readRecentModelIds(),
  );

  const byId = useMemo(() => {
    const map = new Map<string, PickerModel>();
    for (const m of models) map.set(m.id, m);
    return map;
  }, [models]);

  const recent = useMemo(() => {
    const out: PickerModel[] = [];
    for (const id of recentIds) {
      const hit = byId.get(id);
      if (hit) out.push(hit);
    }
    return out.slice(0, 5);
  }, [recentIds, byId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => {
      const hay = `${m.id} ${m.label} ${m.externalModelId || ''} ${m.providerId || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [models, query]);

  const selected = (value && byId.get(value)) || null;

  const placeMenu = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const width = Math.min(560, Math.max(360, box.width + 80));
    let left = box.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = box.bottom + 4;
    const maxH = 420;
    if (top + maxH > window.innerHeight - 8) {
      top = Math.max(8, box.top - maxH - 4);
    }
    setMenuPos({ left, top, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      const menu = document.getElementById('nexus-chat-model-menu');
      if (rootRef.current?.contains(e.target as Node) || menu?.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', placeMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', placeMenu);
    };
  }, [open, placeMenu]);

  function select(id: string | null) {
    if (id) setRecentIds(rememberModelUsage(id));
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  const triggerName = loading
    ? 'Loading…'
    : !models.length
      ? 'No LLM catalog'
      : selected
        ? modelDisplayName(selected.externalModelId || selected.id, selected.label)
        : 'Agent default';
  const triggerProvider = selected
    ? resolveModelProvider({
        modelId: selected.externalModelId || selected.id,
        providerId: selected.providerId,
        iconUrl: selected.iconUrl,
      })
    : null;

  return (
    <div className="nexus-chat-model-picker" ref={rootRef}>
      <button
        type="button"
        className="nexus-chat-model-picker-trigger"
        disabled={disabled || loading || !models.length}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.id || undefined}
        onClick={() => {
          if (disabled || loading || !models.length) return;
          setOpen((v) => !v);
        }}
      >
        {triggerProvider ? <ProviderIcon provider={triggerProvider} /> : null}
        <span className="nexus-chat-model-picker-trigger-label">{triggerName}</span>
        {selected ? (
          <span className="nexus-chat-model-picker-trigger-meta" aria-hidden="true">
            <span className={`nexus-chat-model-price ${priceTone(selected.inputPerM ?? selected.chatPriceCreditsPerMillion)}`}>
              {formatUsdPerM(selected.inputPerM) !== '—'
                ? formatUsdPerM(selected.inputPerM)
                : formatCreditsPerM(selected.chatPriceCreditsPerMillion) || '—'}
            </span>
            <span className={`nexus-chat-model-intel ${intelTone(selected.intelligenceIndex)}`}>
              {formatIntelScore(selected.intelligenceIndex)}
            </span>
          </span>
        ) : null}
        <span className="nexus-chat-model-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          id="nexus-chat-model-menu"
          className="nexus-chat-model-picker-menu"
          role="listbox"
          style={{ left: menuPos.left, top: menuPos.top, width: menuPos.width }}
        >
          <div className="nexus-chat-model-picker-toolbar">
            <input
              autoFocus
              type="search"
              placeholder="Filter models…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {recent.length && !query.trim() ? (
            <div className="nexus-chat-model-picker-recent">
              <div className="nexus-chat-model-picker-section-label">Recent</div>
              {recent.map((m) => (
                <ModelRow
                  key={`recent-${m.id}`}
                  model={m}
                  active={m.id === value}
                  onSelect={() => select(m.id)}
                />
              ))}
            </div>
          ) : null}
          <div className="nexus-chat-model-picker-head" aria-hidden="true">
            <span>Model</span>
            <span title="USD per 1M input tokens when catalog costPricing is present">In</span>
            <span title="USD per 1M output tokens">Out</span>
            <span title="Catalog intelligenceIndex">IQ</span>
          </div>
          <div className="nexus-chat-model-picker-list">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={`nexus-chat-model-picker-row${!value ? ' active' : ''}`}
              onClick={() => select(null)}
            >
              <span className="nexus-chat-model-picker-name">
                <strong>Agent default</strong>
              </span>
              <span className="nexus-chat-model-price unknown">—</span>
              <span className="nexus-chat-model-price unknown">—</span>
              <span className="nexus-chat-model-intel unknown">—</span>
            </button>
            {filtered.map((m) => (
              <ModelRow key={m.id} model={m} active={m.id === value} onSelect={() => select(m.id)} />
            ))}
            {!filtered.length ? <p className="nexus-chat-model-picker-empty">No matches</p> : null}
          </div>
          <footer className="nexus-chat-model-picker-foot">
            IQ: catalog <code>intelligenceIndex</code> · logos: catalog iconUrl / providerId
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function ProviderIcon({
  provider,
}: {
  provider: ReturnType<typeof resolveModelProvider>;
}) {
  const [broken, setBroken] = useState(false);
  const tip = provider.prefix ? `${provider.label} (${provider.prefix})` : provider.label;
  if (provider.iconUrl && !broken) {
    return (
      <img
        className="nexus-chat-model-provider-icon"
        src={provider.iconUrl}
        alt=""
        title={tip}
        width={16}
        height={16}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  const letter = (provider.prefix || '?').slice(0, 1).toUpperCase();
  return (
    <span
      className="nexus-chat-model-provider-badge"
      title={tip}
      style={{ background: provider.color }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

function ModelRow({
  model,
  active,
  onSelect,
}: {
  model: PickerModel;
  active: boolean;
  onSelect: () => void;
}) {
  const provider = resolveModelProvider({
    modelId: model.externalModelId || model.id,
    providerId: model.providerId,
    iconUrl: model.iconUrl,
  });
  const name = modelDisplayName(model.externalModelId || model.id, model.label);
  const inLabel =
    formatUsdPerM(model.inputPerM) !== '—'
      ? formatUsdPerM(model.inputPerM)
      : formatCreditsPerM(model.chatPriceCreditsPerMillion) || '—';
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`nexus-chat-model-picker-row${active ? ' active' : ''}`}
      title={model.id}
      onClick={onSelect}
    >
      <span className="nexus-chat-model-picker-name">
        <ProviderIcon provider={provider} />
        <strong>{name}</strong>
      </span>
      <span className={`nexus-chat-model-price ${priceTone(model.inputPerM ?? model.chatPriceCreditsPerMillion)}`}>
        {inLabel}
      </span>
      <span className={`nexus-chat-model-price ${priceTone(model.outputPerM)}`}>
        {formatUsdPerM(model.outputPerM)}
      </span>
      <span className={`nexus-chat-model-intel ${intelTone(model.intelligenceIndex)}`}>
        {formatIntelScore(model.intelligenceIndex)}
      </span>
    </button>
  );
}
