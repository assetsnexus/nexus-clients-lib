import { mapCatalogRow, mergePickerModels } from './picker-map.js';
import type { PickerModel } from './picker-types.js';

/** Region-sold entitlement sources (same as portal mergeEntitledModelsForPicker). */
export const SUBSCRIPTION_ENTITLEMENT_SOURCES = new Set(['private_byok', 'native', 'heavy']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function entitledUpstreamModelIds(upstreamModelId: unknown): string[] {
  const raw = String(upstreamModelId || '').trim();
  if (!raw) return [];
  const noTilde = raw.startsWith('~') ? raw.slice(1) : raw;
  const noLatest = noTilde.replace(/-latest$/i, '');
  const bases = [raw, noTilde, noLatest].filter(Boolean);
  const out: string[] = [];
  for (const id of bases) {
    out.push(id);
    if (!id.startsWith('~') && !id.startsWith('openrouter/')) out.push(`openrouter/${id}`);
  }
  return [...new Set(out)];
}

function catalogKeysForEntitlement(row: Record<string, unknown>): Set<string> {
  const id = String(row.id || row._id || row.modelId || '').trim();
  const ext = String(row.externalModelId || '').trim();
  const modelKey = String(row.modelKey || '').trim();
  const privateUpstream = id.startsWith('private::')
    ? id.slice('private::'.length).split('::').slice(1).join('::')
    : '';
  const keys = new Set<string>();
  for (const src of [ext, privateUpstream, modelKey, id]) {
    for (const k of entitledUpstreamModelIds(src)) keys.add(k);
    const t = String(src || '').trim();
    if (t) keys.add(t);
  }
  return keys;
}

function indexCatalog(rows: PickerModel[]): Map<string, PickerModel> {
  const byKey = new Map<string, PickerModel>();
  for (const model of rows) {
    for (const key of [
      model.id,
      model.modelRef,
      model.externalModelId,
      String(model.modelRef || '').replace(/^static:/, ''),
      ...entitledUpstreamModelIds(model.externalModelId),
    ]) {
      const k = String(key || '').trim();
      if (k && !byKey.has(k)) byKey.set(k, model);
      const lower = k.toLowerCase();
      if (lower && !byKey.has(lower)) byKey.set(lower, model);
    }
  }
  return byKey;
}

function findCatalogHit(index: Map<string, PickerModel>, keys: Set<string>): PickerModel | null {
  for (const key of keys) {
    const hit = index.get(key) || index.get(String(key).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export function catalogPickerKey(
  row: Record<string, unknown>,
  catalogHit: PickerModel | null,
): string {
  const catalogId = String(
    row.inferenceCatalogModelId || catalogHit?.id || row.catalogModelId || '',
  ).trim();
  if (catalogId) return catalogId;
  const ext = String(row.externalModelId || catalogHit?.externalModelId || '').trim();
  if (ext) return ext.replace(/^~/u, '').replace(/^openrouter\//iu, '');
  const modelKey = String(row.modelKey || '').trim();
  if (modelKey) return modelKey;
  const id = String(row.id || row._id || row.modelId || '').trim();
  if (id.startsWith('private::') || id.startsWith('reseller::')) {
    const parts = id.split('::');
    return parts.slice(2).join('::') || id;
  }
  return id;
}

function entitlementRowsFromPayload(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(payload.models) && payload.models.length) {
    return payload.models as Record<string, unknown>[];
  }
  const bySource =
    payload.bySource && typeof payload.bySource === 'object'
      ? (payload.bySource as Record<string, unknown[]>)
      : {};
  return Object.keys(bySource).flatMap((source) =>
    (Array.isArray(bySource[source]) ? bySource[source] : []).map((row) => ({
      ...(row && typeof row === 'object' ? (row as Record<string, unknown>) : {}),
      source: (row as { source?: string })?.source || source,
    })),
  );
}

function mergePickerRow(base: PickerModel, extra: PickerModel): PickerModel {
  return {
    ...base,
    ...extra,
    intelligenceIndex: extra.intelligenceIndex ?? base.intelligenceIndex,
    inputPerM: extra.inputPerM ?? base.inputPerM,
    outputPerM: extra.outputPerM ?? base.outputPerM,
    iconUrl: extra.iconUrl || base.iconUrl,
    providerId: extra.providerId || base.providerId,
    subscriptionIds: [
      ...new Set([...(base.subscriptionIds || []), ...(extra.subscriptionIds || [])]),
    ],
    capabilities: extra.capabilities?.length ? extra.capabilities : base.capabilities,
    visionSupported: extra.visionSupported ?? base.visionSupported,
    preferredHostingType: extra.preferredHostingType || base.preferredHostingType,
  };
}

/**
 * Portal contract: entitlements are the seed; models.available / models.list
 * only enrich (UUID, intelligenceIndex, icons, prices).
 */
export function mergeEntitledModelsForPicker(opts: {
  availableRows?: Record<string, unknown>[];
  catalogRows?: Record<string, unknown>[];
  entitlementsPayload?: Record<string, unknown> | null;
}): PickerModel[] {
  const entitlementModels = entitlementRowsFromPayload(opts.entitlementsPayload || {});
  const catalogMapped = mergePickerModels(opts.availableRows || [], opts.catalogRows || []);
  const catalogIndex = indexCatalog(catalogMapped);
  const byId = new Map<string, PickerModel>();

  for (const row of entitlementModels) {
    const legacyId = String(row.id || row._id || row.modelId || '').trim();
    if (!legacyId) continue;
    const subscriptionId = row.subscriptionId ? String(row.subscriptionId) : '';
    const source = String(row.source || '').trim();
    const hasRoutes = Array.isArray(row.routes) && row.routes.length > 0;
    if (!subscriptionId && !hasRoutes) continue;
    if (
      source &&
      !SUBSCRIPTION_ENTITLEMENT_SOURCES.has(source) &&
      !legacyId.startsWith('private::') &&
      !legacyId.startsWith('reseller::') &&
      !hasRoutes
    ) {
      continue;
    }

    const catalogHit = findCatalogHit(catalogIndex, catalogKeysForEntitlement(row));
    const catalogKey = catalogPickerKey(row, catalogHit);
    if (!catalogKey) continue;
    const catalogUuid =
      (catalogHit?.id && UUID_RE.test(String(catalogHit.id)) ? String(catalogHit.id) : null) ||
      (row.inferenceCatalogModelId && UUID_RE.test(String(row.inferenceCatalogModelId))
        ? String(row.inferenceCatalogModelId)
        : null);
    const pickerId = catalogUuid || catalogHit?.id || catalogKey;
    const modelRef = catalogUuid
      ? catalogUuid
      : catalogHit?.id
        ? catalogHit.id
        : pickerId.startsWith('static:')
          ? pickerId
          : `static:${pickerId}`;

    const seeded = mapCatalogRow({
      ...row,
      id: pickerId,
      modelRef,
      displayName: catalogHit?.label || row.name || row.displayName || catalogKey,
      name: catalogHit?.label || row.name || row.displayName || catalogKey,
      category: row.category || catalogHit?.category || 'chat',
      capabilities: row.capabilities || catalogHit?.capabilities,
      externalModelId: row.externalModelId || catalogHit?.externalModelId || catalogKey,
      preferredHostingType: row.preferredHostingType || catalogHit?.preferredHostingType,
      intelligenceIndex: row.intelligenceIndex ?? catalogHit?.intelligenceIndex,
      iconUrl: catalogHit?.iconUrl,
      providerId: row.providerId || catalogHit?.providerId,
      providerIconUrl: catalogHit?.iconUrl,
      costPricing: row.costPricing,
      chatPriceCreditsPerMillion:
        row.chatPriceCreditsPerMillion ?? catalogHit?.chatPriceCreditsPerMillion,
      visionSupported: row.visionSupported === true || catalogHit?.visionSupported === true,
      subscriptionId: subscriptionId || undefined,
    });
    if (!seeded) continue;
    seeded.modelRef = modelRef;
    if (catalogHit) {
      byId.set(pickerId, mergePickerRow(seeded, { ...catalogHit, id: pickerId, modelRef }));
    } else {
      byId.set(pickerId, { ...seeded, id: pickerId, modelRef });
    }
  }

  return [...byId.values()];
}
