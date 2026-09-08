/** Pure model-capability helpers for portal / chat pickers (ported from anx-inference frontend). */

export type ChatPickerModelFields = {
  capabilities?: string[] | null;
  category?: string | null;
  dedicatedGpu?: boolean;
  externalModelId?: string | null;
  supportsTools?: boolean | null;
};

export const NON_CHAT_AGENT_CAPABILITIES = [
  'image_gen',
  't2i',
  'i2i',
  'image_edit',
  'image_to_text',
  'i2t',
  'stt',
  'tts',
  'embedding',
  'video',
  't2v',
  'i2v',
  'realtime_voice',
] as const;

export const NON_CHAT_AGENT_CATEGORIES = ['image', 'video', 'tts', 'stt', 'embedding'] as const;

function normalizeCaps(capabilities: string[] | null | undefined): string[] {
  return (capabilities ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
}

/** Models that accept OpenRouter-style `reasoning.effort` (o-series, thinking models). */
export function inferSupportsReasoning(externalModelId: string): boolean {
  const id = externalModelId.toLowerCase().replace(/^openrouter\//, '');
  return (
    /openai\/o[134](-mini|-pro)?/.test(id) ||
    /:thinking/.test(id) ||
    /deepseek\/deepseek-r1/.test(id) ||
    /qwen3.*thinking/.test(id)
  );
}

/** True when catalog flags indicate tool / agent calling support. */
export function modelSupportsToolCalling(
  capabilities: string[] | undefined,
  supportsTools?: boolean | null,
): boolean {
  if (supportsTools === true) return true;
  if (supportsTools === false) return false;
  const caps = capabilities ?? [];
  if (!caps.length) return true;
  return caps.includes('tool_calling') || caps.includes('chat_agent');
}

/** True when a model may appear in the agent chat model picker. */
export function isChatAgentPickerModel(model: ChatPickerModelFields | null | undefined): boolean {
  if (!model) return false;
  if (model.dedicatedGpu) return false;

  const caps = normalizeCaps(model.capabilities);
  const category = String(model.category ?? '').trim().toLowerCase();
  const externalModelId = String(model.externalModelId ?? '').trim().toLowerCase();

  if (/gpt-4o-audio|gpt-audio/.test(externalModelId)) return false;

  const hasAgentCap = caps.includes('chat_agent') || caps.includes('tool_calling');
  if (hasAgentCap) return true;

  if (!caps.includes('text_gen')) return false;
  if (caps.includes('content_writing')) return false;
  if (NON_CHAT_AGENT_CAPABILITIES.some((c) => caps.includes(c))) return false;
  if ((NON_CHAT_AGENT_CATEGORIES as readonly string[]).includes(category)) return false;

  return true;
}

/** Public catalog label: `Model · Vendor` when vendor is known. */
export function formatCatalogModelLabel(
  name: string | null | undefined,
  vendorLabel?: string | null,
): string {
  const base = (name ?? '').trim() || 'Model';
  const vendor = (vendorLabel ?? '').trim();
  return vendor ? `${base} · ${vendor}` : base;
}
