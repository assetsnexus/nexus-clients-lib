import type { ChatModelOverride } from '@nexus/chat-core';

export type PickerModel = {
  id: string;
  modelRef?: string;
  label: string;
  externalModelId?: string;
  providerId?: string | null;
  iconUrl?: string | null;
  intelligenceIndex: number | null;
  inputPerM: number | null;
  outputPerM: number | null;
  chatPriceCreditsPerMillion: number | null;
  preferredHostingType?: ChatModelOverride['preferredHostingType'];
  visionSupported?: boolean;
  subscriptionIds?: string[];
  capabilities?: string[];
  category?: string | null;
};

export function readUsdPerM(row: Record<string, unknown>, side: 'input' | 'output'): number | null {
  const cost = Array.isArray(row.costPricing) ? row.costPricing[0] : row.costPricing;
  if (cost && typeof cost === 'object') {
    const c = cost as Record<string, unknown>;
    const key =
      side === 'input'
        ? c.inputUsdPerMillion ?? c.input_per_m ?? c.inputPerMillion
        : c.outputUsdPerMillion ?? c.output_per_m ?? c.outputPerMillion;
    if (typeof key === 'number' && Number.isFinite(key)) return key;
  }
  const flat =
    side === 'input'
      ? row.inputUsdPerMillion ?? row.input_per_m
      : row.outputUsdPerMillion ?? row.output_per_m;
  return typeof flat === 'number' && Number.isFinite(flat) ? flat : null;
}

export function readIntelligenceIndex(row: Record<string, unknown>): number | null {
  if (typeof row.intelligenceIndex === 'number' && Number.isFinite(row.intelligenceIndex)) {
    return row.intelligenceIndex;
  }
  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null;
  const intel =
    (meta?.intelligence && typeof meta.intelligence === 'object'
      ? (meta.intelligence as Record<string, unknown>)
      : null) ||
    (row.intelligence && typeof row.intelligence === 'object'
      ? (row.intelligence as Record<string, unknown>)
      : null);
  const idx = intel?.index ?? intel?.intelligenceIndex;
  return typeof idx === 'number' && Number.isFinite(idx) ? idx : null;
}
