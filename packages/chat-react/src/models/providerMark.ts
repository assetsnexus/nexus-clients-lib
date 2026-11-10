/**
 * Provider mark for the model picker.
 * Prefer catalog icon / providerId from anx.inference.models.*; otherwise map
 * the same author prefix as oc-controller `llmModelProvider.ts`.
 */

export type ModelProviderInfo = {
  prefix: string;
  label: string;
  color: string;
  iconUrl?: string;
};

/**
 * Accept only a remote http(s) image URL. Model-list payloads must never carry
 * inline image bytes: a `data:`/`blob:` URL (or a raw base64 blob) bloats every
 * picker response and defeats the browser's HTTP image cache. Anything else —
 * including a relative path, which would 404 from the picker's origin — fails
 * closed and the caller falls back to the letter badge.
 */
export function sanitizeProviderIconUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  // Guard against a huge opaque string masquerading as a URL.
  if (s.length > 2048) return null;
  return s;
}

const PROVIDERS: Record<string, Omit<ModelProviderInfo, 'prefix'>> = {
  deepseek: {
    label: 'DeepSeek',
    color: '#4d6bfe',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/deepseek.png',
  },
  openai: {
    label: 'OpenAI',
    color: '#10a37f',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/openai.png',
  },
  anthropic: {
    label: 'Anthropic',
    color: '#d4a27f',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/anthropic.png',
  },
  google: {
    label: 'Google',
    color: '#4285f4',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/gemini-color.png',
  },
  gemini: {
    label: 'Google',
    color: '#4285f4',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/gemini-color.png',
  },
  'meta-llama': {
    label: 'Meta',
    color: '#0668e1',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/meta-color.png',
  },
  meta: {
    label: 'Meta',
    color: '#0668e1',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/meta-color.png',
  },
  mistralai: {
    label: 'Mistral',
    color: '#ff7000',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/mistral.png',
  },
  mistral: {
    label: 'Mistral',
    color: '#ff7000',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/mistral.png',
  },
  qwen: {
    label: 'Qwen',
    color: '#615ced',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/qwen-color.png',
  },
  xai: {
    label: 'xAI',
    color: '#e8e8e8',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/xai.png',
  },
  cohere: {
    label: 'Cohere',
    color: '#39594d',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/cohere-color.png',
  },
  perplexity: {
    label: 'Perplexity',
    color: '#22b8cd',
    iconUrl: 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark/perplexity-color.png',
  },
};

export function stripGatewayPrefix(modelId: string): string {
  const s = modelId.trim();
  const colon = s.indexOf(':');
  if (colon > 0 && !s.slice(0, colon).includes('/')) return s.slice(colon + 1);
  return s;
}

export function modelProviderPrefix(modelId: string): string {
  const core = stripGatewayPrefix(modelId);
  const slash = core.indexOf('/');
  if (slash <= 0) return '';
  return core.slice(0, slash).toLowerCase();
}

export function modelDisplayName(modelId: string, label?: string | null): string {
  if (label && label.trim()) return label.trim();
  const core = stripGatewayPrefix(modelId);
  const slash = core.lastIndexOf('/');
  return slash >= 0 ? core.slice(slash + 1) : core || modelId;
}

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 42% 55%)`;
}

export function resolveModelProvider(input: {
  modelId: string;
  providerId?: string | null;
  iconUrl?: string | null;
}): ModelProviderInfo {
  const cleanIconUrl = sanitizeProviderIconUrl(input.iconUrl);
  if (cleanIconUrl) {
    const prefix = (input.providerId || modelProviderPrefix(input.modelId) || 'model').toLowerCase();
    return {
      prefix,
      label: input.providerId || prefix,
      color: '#8a96a3',
      iconUrl: cleanIconUrl,
    };
  }
  const fromProviderId = String(input.providerId || '').trim().toLowerCase();
  const prefix = fromProviderId || modelProviderPrefix(input.modelId);
  if (!prefix) return { prefix: '', label: 'Model', color: '#8a96a3' };
  const known = PROVIDERS[prefix];
  if (known) return { prefix, ...known };
  return { prefix, label: prefix, color: hashColor(prefix) };
}

const RECENT_KEY = 'nexus-chat-model-recent';
const RECENT_MAX = 5;

export function readRecentModelIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || '').trim()).filter(Boolean).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberModelUsage(modelId: string): string[] {
  const id = modelId.trim();
  if (!id) return readRecentModelIds();
  const next = [id, ...readRecentModelIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
