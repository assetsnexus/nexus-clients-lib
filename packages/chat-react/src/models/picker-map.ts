import { isChatAgentPickerModel } from '@nexus/chat-core';
import { readIntelligenceIndex, readUsdPerM, type PickerModel } from './picker-types.js';

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
  const hosting = String(m.preferredHostingType || m.hostingType || '').trim();
  const preferredHostingType =
    hosting === 'public_cloud' ||
    hosting === 'managed_cloud' ||
    hosting === 'private_cloud' ||
    hosting === 'edge_processing'
      ? hosting
      : undefined;
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
    chatPriceCreditsPerMillion: chatPrice,
    preferredHostingType,
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
