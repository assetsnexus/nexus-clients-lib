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

export type ReasoningEffortLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const ALL_REASONING_EFFORT_LEVELS: readonly ReasoningEffortLevel[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

function normalizeCaps(capabilities: string[] | null | undefined): string[] {
  return (capabilities ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
}

function normalizeReasoningModelId(externalModelId: string): string {
  return String(externalModelId || '')
    .toLowerCase()
    .trim()
    .replace(/^~+/, '')
    .replace(/^openrouter\//, '');
}

function hasReasoningCapability(capabilities?: string[] | null): boolean {
  return normalizeCaps(capabilities).some(
    (c) =>
      c === 'reasoning' ||
      c === 'thinking' ||
      c === 'reasoning_effort' ||
      c.includes('extended_thinking'),
  );
}

function isBatchVariantModelId(id: string): boolean {
  return /:batch\b/.test(id);
}

function isImageOrientedModelId(id: string): boolean {
  return (
    /gpt-image/.test(id) ||
    /:image\b/.test(id) ||
    /-image(\b|[.-])/.test(id) ||
    /\/image-/.test(id)
  );
}

/**
 * Models that accept OpenAI/OpenRouter-style reasoning effort controls.
 * GPT-5+/branded OpenAI tiers, modern Claude, o-series, thinking variants.
 */
export function inferSupportsReasoning(
  externalModelId: string,
  category?: string | null,
  capabilities?: string[] | null,
): boolean {
  const id = normalizeReasoningModelId(externalModelId);
  const cat = String(category ?? 'chat')
    .trim()
    .toLowerCase();
  if (cat && cat !== 'chat' && cat !== 'vl') return false;
  if (isBatchVariantModelId(id) || isImageOrientedModelId(id)) return false;
  if (!id && !hasReasoningCapability(capabilities)) return false;
  if (hasReasoningCapability(capabilities)) return true;

  if (/(^|\/)gpt-[5-9](\b|[.-])/.test(id)) return true;
  if (/(^|\/)gpt-(?:astra|sol|terra|luna|mini)(\b|[.-])/.test(id)) return true;
  if (/(^|\/)o[1-9](\b|[.-])/.test(id)) return true;
  if (/(^|\/)claude-/.test(id)) {
    if (/haiku/.test(id) && !/thinking|:thinking/.test(id)) return false;
    return true;
  }
  if (/grok-(?:[4-9]|latest)(\b|[.-])/.test(id)) return true;
  if (
    /:thinking\b/.test(id) ||
    /\bthinking\b/.test(id) ||
    /deepseek-r1/.test(id) ||
    /deepseek-reasoner/.test(id) ||
    (/qwen3/.test(id) && /thinking/.test(id))
  ) {
    return true;
  }
  return false;
}

/** Effort levels valid for this model, or null when unsupported. */
export function resolveReasoningEffortLevels(
  externalModelId: string,
  category?: string | null,
  capabilities?: string[] | null,
): ReasoningEffortLevel[] | null {
  if (!inferSupportsReasoning(externalModelId, category, capabilities)) return null;
  const id = normalizeReasoningModelId(externalModelId);

  if (
    /(?:^|\/)gpt-(?:astra|sol|terra|luna)(\b|[.-])/.test(id) ||
    /(?:^|\/)gpt-[6-9](\b|[.-])/.test(id) ||
    /gpt-5\.(?:[2-9]|\d{2,})/.test(id) ||
    /codex-max/.test(id) ||
    /gpt-5\.5/.test(id)
  ) {
    return ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  }
  if (/gpt-5\.1/.test(id)) {
    return ['none', 'low', 'medium', 'high'];
  }
  if (/(^|\/)gpt-5(\b|[.-])/.test(id) || /(?:^|\/)gpt-mini(\b|[.-])/.test(id)) {
    return ['minimal', 'low', 'medium', 'high'];
  }
  if (/(^|\/)claude-/.test(id)) {
    return ['none', 'low', 'medium', 'high'];
  }
  return ['low', 'medium', 'high'];
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
  // Batch-only catalog variants stay in workloads/automations, not interactive chat.
  if (/:batch\b/.test(externalModelId)) return false;
  // Image-specialized GPT rows (even when stamped chat_agent) stay out of chat picker.
  if (/-image(\b|[.-])|gpt-image|:image\b/.test(externalModelId)) return false;

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
