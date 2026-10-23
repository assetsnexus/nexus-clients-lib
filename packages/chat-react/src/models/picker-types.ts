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
  /**
   * Cached-input (cache read) USD per 1M tokens. Prefer an explicit catalog
   * `cache_read` row; otherwise derived from `inputPerM` at the platform's
   * cache-read multiplier. `null` when no input price is known.
   */
  cachedPerM: number | null;
  /** Where `cachedPerM` came from — an explicit row, or derived from input. */
  cachedPerMSource: 'catalog' | 'derived' | null;
  /** Currency of the cost rows (`USD` unless an upstream priced in another). */
  costCurrency: string | null;
  chatPriceCreditsPerMillion: number | null;
  preferredHostingType?: ChatModelOverride['preferredHostingType'];
  /**
   * Every hosting class this model can run on, canonical keys
   * (`public_cloud` | `managed_cloud` | `private_cloud` | `edge_processing`).
   */
  availableHostingTypes: string[];
  visionSupported?: boolean;
  subscriptionIds?: string[];
  capabilities?: string[];
  category?: string | null;
};

const MILLICENTS_PER_DOLLAR = 100_000;

/**
 * Cache-read tokens are billed at 10% of the input rate (Anthropic/OpenRouter
 * typical). Mirrors `CACHE_READ_INPUT_RATE` in the inference billing layer —
 * the region exposes no cached-token catalog row, so a derived value is the
 * only honest number available, and callers must label it as derived.
 */
export const CACHE_READ_INPUT_RATE = 0.1;

function tokenUnit(unit: unknown): 'token_in' | 'token_out' | null {
  const key = String(unit || '').trim().toLowerCase();
  if (key === 'token_in' || key === 'tokens_in' || key === 'input_tokens') return 'token_in';
  if (key === 'token_out' || key === 'tokens_out' || key === 'output_tokens') return 'token_out';
  return null;
}

/** Cache-read units seen in the wild; the region's `PricingUnit` has none yet. */
function isCacheReadUnit(unit: unknown): boolean {
  const key = String(unit || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, '');
  return (
    key === 'cache_read' ||
    key === 'token_in_cache_read' ||
    key === 'token_cache_read' ||
    key === 'cached_input' ||
    key === 'input_cache_read'
  );
}

function costRowLists(row: Record<string, unknown>): Record<string, unknown>[] {
  const lists = [row.costPricing, row.suggestedCostPricing];
  const out: Record<string, unknown>[] = [];
  for (const list of lists) {
    if (Array.isArray(list)) {
      for (const raw of list) if (raw && typeof raw === 'object') out.push(raw as Record<string, unknown>);
    } else if (list && typeof list === 'object') {
      out.push(list as Record<string, unknown>);
    }
  }
  return out;
}

/** USD per 1M tokens from a catalog millicent row. Same scale as portal cost rows. */
function usdPerMFromMillicents(millicents: unknown): number | null {
  if (typeof millicents !== 'number' || !Number.isFinite(millicents)) return null;
  return (millicents / MILLICENTS_PER_DOLLAR) * 1_000_000;
}

export function readUsdPerM(row: Record<string, unknown>, side: 'input' | 'output'): number | null {
  const want = side === 'input' ? 'token_in' : 'token_out';
  for (const raw of costRowLists(row)) {
    const key =
      side === 'input'
        ? raw.inputUsdPerMillion ?? raw.input_per_m ?? raw.inputPerMillion
        : raw.outputUsdPerMillion ?? raw.output_per_m ?? raw.outputPerMillion;
    if (typeof key === 'number' && Number.isFinite(key)) return key;
  }
  const flat =
    side === 'input'
      ? row.inputUsdPerMillion ?? row.input_per_m
      : row.outputUsdPerMillion ?? row.output_per_m;
  if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
  for (const raw of costRowLists(row)) {
    if (tokenUnit(raw.unit) !== want) continue;
    const usd = usdPerMFromMillicents(raw.unitPriceMillicents);
    if (usd != null) return usd;
  }
  return null;
}

/**
 * Explicit cached-input price, when the upstream catalog priced it.
 *
 * Reads a real cache-read row (`unit: 'cache_read'`, legacy `cached_input`)
 * before any flat/derived field, so an explicit price always outranks the
 * `input × 0.1` estimate. Returns `null` when the catalog priced no cache row.
 */
export function readExplicitCachedUsdPerM(row: Record<string, unknown>): number | null {
  const rows = costRowLists(row);
  // Pass 1 — an explicit cache-read unit row (region `PricingUnit: 'cache_read'`,
  // legacy `cached_input`). This is the frozen sibling-worker contract.
  for (const raw of rows) {
    if (!isCacheReadUnit(raw.unit)) continue;
    const usd = usdPerMFromMillicents(raw.unitPriceMillicents);
    if (usd != null) return usd;
    const direct =
      raw.cachedUsdPerMillion ?? raw.cached_per_m ?? raw.cacheReadUsdPerMillion ?? raw.cache_read_per_m;
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  }
  // Pass 2 — a pre-converted flat cached USD field.
  for (const raw of rows) {
    const direct =
      raw.cachedUsdPerMillion ?? raw.cached_per_m ?? raw.cacheReadUsdPerMillion ?? raw.cache_read_per_m;
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  }
  const flat = row.cachedUsdPerMillion ?? row.cached_per_m;
  return typeof flat === 'number' && Number.isFinite(flat) ? flat : null;
}

export function readCachedUsdPerM(row: Record<string, unknown>): {
  cachedPerM: number | null;
  source: 'catalog' | 'derived' | null;
} {
  const explicit = readExplicitCachedUsdPerM(row);
  if (explicit != null) return { cachedPerM: explicit, source: 'catalog' };
  const input = readUsdPerM(row, 'input');
  if (input == null) return { cachedPerM: null, source: null };
  return { cachedPerM: input * CACHE_READ_INPUT_RATE, source: 'derived' };
}

/** Currency of the first cost row that declares one. */
export function readCostCurrency(row: Record<string, unknown>): string | null {
  for (const raw of costRowLists(row)) {
    const c = raw.currency;
    if (typeof c === 'string' && c.trim()) return c.trim().toUpperCase();
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

/**
 * Canonical hosting classes a row advertises. Accepts the region's canonical
 * keys as well as the short aliases the system catalog returns
 * (`public` / `managed` / `private` / `edge`). Unknown values are dropped.
 */
export const ALL_HOSTING_TYPES = [
  'public_cloud',
  'managed_cloud',
  'private_cloud',
  'edge_processing',
] as const;

const HOSTING_ALIASES: Record<string, string> = {
  public: 'public_cloud',
  public_cloud: 'public_cloud',
  'public-cloud': 'public_cloud',
  managed: 'managed_cloud',
  managed_cloud: 'managed_cloud',
  'managed-cloud': 'managed_cloud',
  private: 'private_cloud',
  private_cloud: 'private_cloud',
  'private-cloud': 'private_cloud',
  edge: 'edge_processing',
  edge_processing: 'edge_processing',
  'edge-processing': 'edge_processing',
};

export function normalizeHostingTypes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw];
  const allowed = new Set<string>(ALL_HOSTING_TYPES);
  const out: string[] = [];
  for (const item of list) {
    const key = String(item ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const mapped = HOSTING_ALIASES[key] || HOSTING_ALIASES[key.replace(/_cloud$/, '')];
    if (mapped && allowed.has(mapped) && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/** Hosting classes for one row: explicit list, else the preferred one. */
export function readAvailableHostingTypes(row: Record<string, unknown>): string[] {
  const explicit = normalizeHostingTypes(
    row.availableHostingTypes ?? row.hostingTypes ?? row.hostingType,
  );
  if (explicit.length) return explicit;
  return normalizeHostingTypes(row.preferredHostingType);
}
