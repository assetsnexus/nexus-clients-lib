import { chatModelPriceLevel, modelPriceSymbols } from '@nexus/chat-core';
import { formatCreditsPerM, formatIntelScore, formatUsdPerM } from './intel.js';
import type { PickerModel } from './picker-types.js';

/** Billing gateways are not the model author. Author comes from the catalog model id. */
const GATEWAY_PROVIDER_IDS = new Set(['openrouter', 'nexus', 'assetsnexus', 'comfy']);

export function authorMarkInput(
  model: Pick<PickerModel, 'id' | 'label' | 'externalModelId' | 'providerId' | 'iconUrl'>,
): { modelId: string; providerId: string | null; iconUrl: string | null } {
  const raw = String(model.providerId || '').trim().toLowerCase();
  const providerId = raw && !GATEWAY_PROVIDER_IDS.has(raw) ? raw : null;
  return {
    modelId: model.externalModelId || model.id,
    providerId,
    iconUrl: model.iconUrl || null,
  };
}

/**
 * Compact chips for one catalog row.
 * A missing price or intelligence index is omitted. Never substitute a placeholder number.
 */
export function compactPriceLabel(
  model: Pick<PickerModel, 'inputPerM' | 'chatPriceCreditsPerMillion'>,
): string | null {
  if (typeof model.inputPerM === 'number' && Number.isFinite(model.inputPerM)) {
    const usd = formatUsdPerM(model.inputPerM);
    if (usd === '—') return null;
    return usd === 'free' ? 'free' : `${usd}/M`;
  }
  const credits = model.chatPriceCreditsPerMillion;
  if (typeof credits !== 'number' || !Number.isFinite(credits) || credits <= 0) return null;
  const symbols = modelPriceSymbols(chatModelPriceLevel(credits));
  if (symbols && symbols !== '–') return symbols;
  return formatCreditsPerM(credits) || null;
}

export function compactIntelLabel(intelligenceIndex: number | null | undefined): string | null {
  if (typeof intelligenceIndex !== 'number' || !Number.isFinite(intelligenceIndex)) return null;
  const label = formatIntelScore(intelligenceIndex);
  return label === '—' ? null : label;
}
