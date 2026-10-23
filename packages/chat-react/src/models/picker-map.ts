import { isChatAgentPickerModel } from '@nexus/chat-core';
import {
  normalizeHostingTypes,
  readAvailableHostingTypes,
  readCostCurrency,
  readCachedUsdPerM,
  readIntelligenceIndex,
  readUsdPerM,
  type PickerModel,
} from './picker-types.js';

export function mapCatalogRow(m: Record<string, unknown>): PickerModel | null {
  if (!m || m.active === false) return null;
  const id = String(m.id || m.modelId || m._id || '').trim();
  if (!id) return null;
  const caps = Array.isArray(m.capabilities) ? m.capabilities.map((c) => String(c)) : [];
  const chatPrice =
    typeof m.chatPriceCreditsPerMillion === 'number'
      ? m.chatPriceCreditsPerMillion
      : typeof m.priceCreditsPerMillion === 'number'
        ? m.priceCreditsPerMillion
        : null;
  const preferredHostingType = normalizeHostingTypes(
    m.preferredHostingType || m.hostingType,
  )[0] as PickerModel['preferredHostingType'];
  const cached = readCachedUsdPerM(m);
  return {
    id,
    modelRef: typeof m.modelRef === 'string' ? m.modelRef : undefined,
    label: String(m.catalogDisplayName || m.displayName || m.name || m.label || id),
    externalModelId: m.externalModelId != null ? String(m.externalModelId) : undefined,
    providerId: m.providerId != null ? String(m.providerId) : null,
    iconUrl:
      typeof m.iconUrl === 'string'
        ? m.iconUrl
        : typeof m.providerIconUrl === 'string'
          ? m.providerIconUrl
          : typeof m.logoUrl === 'string'
            ? m.logoUrl
            : null,
    intelligenceIndex: readIntelligenceIndex(m),
    inputPerM: readUsdPerM(m, 'input'),
    outputPerM: readUsdPerM(m, 'output'),
    cachedPerM: cached.cachedPerM,
    cachedPerMSource: cached.source,
    costCurrency: readCostCurrency(m),
    chatPriceCreditsPerMillion: chatPrice,
    preferredHostingType,
    availableHostingTypes: readAvailableHostingTypes(m),
    visionSupported: typeof m.visionSupported === 'boolean' ? m.visionSupported : undefined,
    subscriptionIds: m.subscriptionId ? [String(m.subscriptionId)] : undefined,
    capabilities: caps,
    category: m.category != null ? String(m.category) : null,
  };
}

export function mergePickerModels(
  availableRows: Record<string, unknown>[],
  catalogRows: Record<string, unknown>[],
): PickerModel[] {
  const byId = new Map<string, PickerModel>();
  for (const raw of [...catalogRows, ...availableRows]) {
    const mapped = mapCatalogRow(raw);
    if (!mapped) continue;
    const prev = byId.get(mapped.id);
    if (!prev) {
      byId.set(mapped.id, mapped);
      continue;
    }
    byId.set(mapped.id, {
      ...prev,
      ...mapped,
      intelligenceIndex: mapped.intelligenceIndex ?? prev.intelligenceIndex,
      inputPerM: mapped.inputPerM ?? prev.inputPerM,
      outputPerM: mapped.outputPerM ?? prev.outputPerM,
      // An explicit catalog cache row outranks a value derived from input.
      cachedPerM:
        mapped.cachedPerMSource === 'catalog'
          ? mapped.cachedPerM
          : (mapped.cachedPerM ?? prev.cachedPerM),
      cachedPerMSource:
        mapped.cachedPerMSource === 'catalog'
          ? 'catalog'
          : (mapped.cachedPerMSource ?? prev.cachedPerMSource),
      costCurrency: mapped.costCurrency || prev.costCurrency,
      availableHostingTypes: mergeHostingTypes(
        prev.availableHostingTypes,
        mapped.availableHostingTypes,
      ),
      preferredHostingType: mapped.preferredHostingType || prev.preferredHostingType,
      iconUrl: mapped.iconUrl || prev.iconUrl,
      providerId: mapped.providerId || prev.providerId,
    });
  }
  return [...byId.values()].filter((m) =>
    isChatAgentPickerModel({
      capabilities: m.capabilities,
      category: m.category,
      externalModelId: m.externalModelId,
    }),
  );
}

/** Union of two hosting lists, region order first. */
export function mergeHostingTypes(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const h of b) if (!out.includes(h)) out.push(h);
  return out;
}
