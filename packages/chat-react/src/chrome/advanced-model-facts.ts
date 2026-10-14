import { authorMarkInput, compactIntelLabel, compactPriceLabel } from '../models/picker-row.js';
import type { PickerModel } from '../models/picker-types.js';
import { resolveModelProvider } from '../models/providerMark.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdvancedModelFacts = {
  name: string | null;
  author: string | null;
  price: string | null;
  intel: string | null;
};

function humanToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || UUID_RE.test(trimmed)) return null;
  const slash = trimmed.lastIndexOf('/');
  const name = (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).replace(/^static:/i, '').trim();
  if (!name || UUID_RE.test(name)) return null;
  return name;
}

/** Catalog display name. A raw id is omitted. */
export function humanModelName(
  model: Pick<PickerModel, 'id' | 'label' | 'externalModelId'>,
): string | null {
  const label = humanToken(model.label || '');
  if (label) return label;
  const external = humanToken(model.externalModelId || '');
  if (external) return external;
  return humanToken(model.id || '');
}

export function authorLabel(
  model: Pick<PickerModel, 'id' | 'label' | 'externalModelId' | 'providerId' | 'iconUrl'>,
): string | null {
  const provider = resolveModelProvider(authorMarkInput(model));
  if (!provider.prefix && provider.label === 'Model') return null;
  const label = provider.label.trim();
  return label && label !== 'Model' ? label : null;
}

/** Chips for the open advanced section. Missing values are omitted. */
export function advancedModelFacts(
  model: Pick<
    PickerModel,
    | 'id'
    | 'label'
    | 'externalModelId'
    | 'providerId'
    | 'iconUrl'
    | 'inputPerM'
    | 'chatPriceCreditsPerMillion'
    | 'intelligenceIndex'
  > | null,
): AdvancedModelFacts | null {
  if (!model) return null;
  const facts: AdvancedModelFacts = {
    name: humanModelName(model),
    author: authorLabel(model),
    price: compactPriceLabel(model),
    intel: compactIntelLabel(model.intelligenceIndex),
  };
  if (!facts.name && !facts.author && !facts.price && !facts.intel) return null;
  return facts;
}

export function resolveEffectivePickerModel(
  models: PickerModel[],
  selectedId: string | null | undefined,
  defaultModelKey: string | null | undefined,
): PickerModel | null {
  const selected = String(selectedId || '').trim();
  if (selected) {
    const hit = models.find((model) => model.id === selected || model.modelRef === selected);
    if (hit) return hit;
  }
  const key = String(defaultModelKey || '').trim().toLowerCase();
  if (!key) return null;
  return (
    models.find((model) => {
      const fields = [model.id, model.modelRef, model.externalModelId, model.label]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      if (fields.includes(key)) return true;
      return fields.some((field) => field.endsWith(`/${key}`) || key.endsWith(`/${field}`));
    }) || null
  );
}

/** Shown when the catalog request failed or returned nothing. Never a placeholder dash. */
export function advancedCatalogNotice(input: {
  modelsError?: string | null;
  modelCount: number;
  loading?: boolean;
}): string | null {
  if (input.loading) return null;
  const error = String(input.modelsError || '').trim();
  if (error) return error;
  if (input.modelCount === 0) return 'No models are available.';
  return null;
}

export function contextUsageVisible(model: {
  pct: number | null;
  slices: readonly unknown[];
  tokenLabel: string;
}): boolean {
  if (model.slices.length > 0) return true;
  if (model.pct != null) return true;
  return Boolean(model.tokenLabel) && model.tokenLabel !== '—';
}
