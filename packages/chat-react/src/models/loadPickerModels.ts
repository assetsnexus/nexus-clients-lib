import type { CommandClient } from '@nexus/chat-core';
import { mergeEntitledModelsForPicker } from './mergeEntitledModels.js';
import { mapCatalogRow, mergePickerModels } from './picker-map.js';
import type { PickerModel } from './picker-types.js';

export { mapCatalogRow, mergePickerModels };

function unwrap(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  if (r.response && typeof r.response === 'object') {
    const response = r.response as Record<string, unknown>;
    if (response.responseObject && typeof response.responseObject === 'object') {
      return response.responseObject as Record<string, unknown>;
    }
    return response;
  }
  return r;
}

function isCommandOk(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  if ('ok' in result && (result as { ok?: boolean }).ok === false) return false;
  return true;
}

function rowsFrom(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(payload.models)) return payload.models as Record<string, unknown>[];
  if (Array.isArray(payload.items)) return payload.items as Record<string, unknown>[];
  return [];
}

/**
 * Same three commands as portal `loadEntitledModelsForPicker`:
 * entitlements seed the picker; available + models.list enrich.
 */
export async function loadPickerModels(
  client: CommandClient,
  opts?: { agentId?: string | null },
): Promise<PickerModel[]> {
  const [availableResult, entitlementsResult, catalogResult] = await Promise.all([
    client.send('anx.inference.models.available', opts?.agentId ? { agentId: opts.agentId } : {}),
    client.send('anx.ai-agents.entitlements.list', {}),
    client.send('anx.inference.models.list', { publishedOnly: false }),
  ]);
  const availableRows = isCommandOk(availableResult) ? rowsFrom(unwrap(availableResult)) : [];
  const catalogRows = isCommandOk(catalogResult) ? rowsFrom(unwrap(catalogResult)) : [];
  if (isCommandOk(entitlementsResult)) {
    const entitled = mergeEntitledModelsForPicker({
      availableRows,
      catalogRows,
      entitlementsPayload: unwrap(entitlementsResult),
    });
    if (entitled.length) return entitled;
  }
  return mergePickerModels(availableRows, catalogRows);
}

export function buildModelOverride(
  selectedId: string | null | undefined,
  models: PickerModel[],
): import('@nexus/chat-core').ChatModelOverride | null {
  const id = selectedId == null ? '' : String(selectedId).trim();
  if (!id || id === '__agent_default__') return null;
  const hit = models.find((m) => m.id === id || m.modelRef === id);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const catalogId = hit?.modelRef || hit?.id || id;
  const raw = String(catalogId).replace(/^static:/i, '');
  let modelId: string;
  if (uuidRe.test(raw)) modelId = raw;
  else if (String(catalogId).startsWith('static:')) modelId = String(catalogId);
  else modelId = `static:${raw}`;
  const override: import('@nexus/chat-core').ChatModelOverride = { modelId };
  if (hit?.externalModelId) override.externalModelId = hit.externalModelId;
  if (hit?.preferredHostingType) override.preferredHostingType = hit.preferredHostingType;
  if (typeof hit?.visionSupported === 'boolean') override.visionSupported = hit.visionSupported;
  return override;
}
