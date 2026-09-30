import { isChatAgentPickerModel } from '../model-capabilities.js';
import type { ChatModelOverride } from '../types.js';

export type AvailableChatModel = {
  id: string;
  modelRef: string;
  displayName: string;
  externalModelId: string | null;
  providerId: string | null;
  intelligenceIndex: number | null;
  chatPriceCreditsPerMillion: number | null;
  preferredHostingType: ChatModelOverride['preferredHostingType'] | null;
  availableHostingTypes: string[];
  visionSupported: boolean;
  reasoningSupported: boolean;
  reasoningEffortLevels: string[] | null;
  capabilities: string[];
  category: string | null;
  supportsTools: boolean | null;
};

export type ModelsAvailableCatalog = {
  models: AvailableChatModel[];
  priceScaleReference: {
    platformCreditsPerMillionInput?: number;
    floorCreditsPerMillionInput?: number;
  } | null;
};

type SendClient = {
  send: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

function hosting(
  value: unknown,
): ChatModelOverride['preferredHostingType'] | null {
  const v = String(value || '').trim();
  if (
    v === 'public_cloud' ||
    v === 'managed_cloud' ||
    v === 'private_cloud' ||
    v === 'edge_processing'
  ) {
    return v;
  }
  return null;
}

export function mapAvailableChatModels(raw: unknown): ModelsAvailableCatalog {
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? unwrapData(raw)
      : {};
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((data as { models?: unknown }).models)
      ? ((data as { models: unknown[] }).models)
      : Array.isArray((data as { items?: unknown }).items)
        ? ((data as { items: unknown[] }).items)
        : [];

  const priceScale =
    data.priceScaleReference && typeof data.priceScaleReference === 'object'
      ? (data.priceScaleReference as ModelsAvailableCatalog['priceScaleReference'])
      : null;

  const models: AvailableChatModel[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const m = row as Record<string, unknown>;
    const id = String(m.id || m._id || m.modelId || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const caps = Array.isArray(m.capabilities)
      ? m.capabilities.map((c) => String(c))
      : [];
    const mapped = {
      capabilities: caps,
      category: m.category != null ? String(m.category) : null,
      dedicatedGpu: m.dedicatedGpu === true,
      externalModelId: m.externalModelId != null ? String(m.externalModelId) : null,
      supportsTools: typeof m.supportsTools === 'boolean' ? m.supportsTools : null,
    };
    if (!isChatAgentPickerModel(mapped)) continue;

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const modelRef = uuidRe.test(id) || id.startsWith('static:') ? id : `static:${id}`;

    models.push({
      id,
      modelRef,
      displayName: String(m.displayName || m.name || m.label || mapped.externalModelId || id),
      externalModelId: mapped.externalModelId,
      providerId: m.providerId != null ? String(m.providerId) : null,
      intelligenceIndex:
        typeof m.intelligenceIndex === 'number' && Number.isFinite(m.intelligenceIndex)
          ? m.intelligenceIndex
          : null,
      chatPriceCreditsPerMillion:
        typeof m.chatPriceCreditsPerMillion === 'number' &&
        Number.isFinite(m.chatPriceCreditsPerMillion)
          ? m.chatPriceCreditsPerMillion
          : null,
      preferredHostingType: hosting(m.preferredHostingType),
      availableHostingTypes: Array.isArray(m.availableHostingTypes)
        ? m.availableHostingTypes.map((t) => String(t))
        : [],
      visionSupported: m.visionSupported === true,
      reasoningSupported: m.reasoningSupported === true,
      reasoningEffortLevels: Array.isArray(m.reasoningEffortLevels)
        ? m.reasoningEffortLevels.map((x) => String(x))
        : null,
      capabilities: caps,
      category: mapped.category,
      supportsTools: mapped.supportsTools,
    });
  }

  return { models, priceScaleReference: priceScale };
}

export function buildChatModelOverride(
  selectedId: string | null | undefined,
  models: AvailableChatModel[],
): ChatModelOverride | null {
  const id = String(selectedId || '').trim();
  if (!id || id === '__agent_default__') return null;
  const hit = models.find((m) => m.id === id || m.modelRef === id);
  if (!hit) {
    return { modelId: id.startsWith('static:') || id.includes('/') ? id : `static:${id}` };
  }
  const override: ChatModelOverride = { modelId: hit.modelRef };
  if (hit.externalModelId) override.externalModelId = hit.externalModelId;
  if (hit.preferredHostingType) override.preferredHostingType = hit.preferredHostingType;
  if (hit.visionSupported) override.visionSupported = true;
  return override;
}

export async function listAvailableChatModels(
  client: SendClient,
  payload?: { agentId?: string; category?: string; role?: 'owner' | 'orgMember' | 'public' },
): Promise<ModelsAvailableCatalog> {
  const result = await client.send('anx.inference.models.available', {
    ...(payload?.agentId ? { agentId: payload.agentId } : {}),
    ...(payload?.category ? { category: payload.category } : {}),
    ...(payload?.role ? { role: payload.role } : {}),
  });
  if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false) {
    const fail = result as { message?: string };
    throw new Error(fail.message || 'anx.inference.models.available failed');
  }
  return mapAvailableChatModels(result);
}
