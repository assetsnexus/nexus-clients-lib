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

const MILLICENTS_PER_DOLLAR = 100_000;

function tokenUnit(unit: unknown): 'token_in' | 'token_out' | null {
  const key = String(unit || '').trim().toLowerCase();
  if (key === 'token_in' || key === 'tokens_in' || key === 'input_tokens') return 'token_in';
  if (key === 'token_out' || key === 'tokens_out' || key === 'output_tokens') return 'token_out';
  return null;
}

/** USD per 1M tokens from a catalog millicent row. Same scale as portal cost rows. */
function usdPerMFromMillicents(row: Record<string, unknown>, side: 'input' | 'output'): number | null {
  const want = side === 'input' ? 'token_in' : 'token_out';
  if (tokenUnit(row.unit) !== want) return null;
  const millicents = row.unitPriceMillicents;
  if (typeof millicents !== 'number' || !Number.isFinite(millicents)) return null;
  return (millicents / MILLICENTS_PER_DOLLAR) * 1_000_000;
}

export function readUsdPerM(row: Record<string, unknown>, side: 'input' | 'output'): number | null {
  const lists = [row.costPricing, row.suggestedCostPricing];
  for (const list of lists) {
    const rows = Array.isArray(list) ? list : list && typeof list === 'object' ? [list] : [];
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const c = raw as Record<string, unknown>;
      const key =
        side === 'input'
          ? c.inputUsdPerMillion ?? c.input_per_m ?? c.inputPerMillion
          : c.outputUsdPerMillion ?? c.output_per_m ?? c.outputPerMillion;
      if (typeof key === 'number' && Number.isFinite(key)) return key;
    }
  }
  const flat =
    side === 'input'
      ? row.inputUsdPerMillion ?? row.input_per_m
      : row.outputUsdPerMillion ?? row.output_per_m;
  if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const usd = usdPerMFromMillicents(raw as Record<string, unknown>, side);
      if (usd != null) return usd;
    }
  }
  return null;
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
