/**
 * Provider mark for the model picker.
 * Prefer catalog icon / providerId from anx.inference.models.*; otherwise map
 * the same author prefix as oc-controller `llmModelProvider.ts`.
 *
 * Icons ship as remote http(s) URLs only. Lobehub publishes both `light/`
 * (dark glyphs for white rows) and `dark/` (light glyphs for dark chrome) —
 * pick via `theme`. Desktop defaults to `dark`; portal/white surfaces use
 * `light`.
 */

export type ModelProviderInfo = {
  prefix: string;
  label: string;
  color: string;
  iconUrl?: string;
};

export type ProviderIconTheme = 'light' | 'dark';

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

const LOBEHUB_BASE = 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png';

function lobe(theme: ProviderIconTheme, file: string): string {
  return `${LOBEHUB_BASE}/${theme}/${file}`;
}

function buildProviders(theme: ProviderIconTheme): Record<string, Omit<ModelProviderInfo, 'prefix'>> {
  return {
    deepseek: { label: 'DeepSeek', color: '#4d6bfe', iconUrl: lobe(theme, 'deepseek.png') },
    openai: { label: 'OpenAI', color: '#10a37f', iconUrl: lobe(theme, 'openai.png') },
    gpt: { label: 'OpenAI', color: '#10a37f', iconUrl: lobe(theme, 'openai.png') },
    anthropic: { label: 'Anthropic', color: '#d4a27f', iconUrl: lobe(theme, 'anthropic.png') },
    claude: { label: 'Anthropic', color: '#d4a27f', iconUrl: lobe(theme, 'claude.png') },
    google: { label: 'Google', color: '#4285f4', iconUrl: lobe(theme, 'gemini-color.png') },
    gemini: { label: 'Google', color: '#4285f4', iconUrl: lobe(theme, 'gemini-color.png') },
    'meta-llama': { label: 'Meta', color: '#0668e1', iconUrl: lobe(theme, 'meta-color.png') },
    meta: { label: 'Meta', color: '#0668e1', iconUrl: lobe(theme, 'meta-color.png') },
    llama: { label: 'Meta', color: '#0668e1', iconUrl: lobe(theme, 'meta-color.png') },
    mistralai: { label: 'Mistral', color: '#ff7000', iconUrl: lobe(theme, 'mistral.png') },
    mistral: { label: 'Mistral', color: '#ff7000', iconUrl: lobe(theme, 'mistral.png') },
    qwen: { label: 'Qwen', color: '#615ced', iconUrl: lobe(theme, 'qwen-color.png') },
    alibaba: { label: 'Qwen', color: '#615ced', iconUrl: lobe(theme, 'qwen-color.png') },
    xai: { label: 'xAI', color: theme === 'light' ? '#111111' : '#e8e8e8', iconUrl: lobe(theme, 'xai.png') },
    grok: { label: 'xAI', color: theme === 'light' ? '#111111' : '#e8e8e8', iconUrl: lobe(theme, 'grok.png') },
    cohere: { label: 'Cohere', color: '#39594d', iconUrl: lobe(theme, 'cohere-color.png') },
    perplexity: { label: 'Perplexity', color: '#22b8cd', iconUrl: lobe(theme, 'perplexity-color.png') },
    moonshot: { label: 'Moonshot', color: '#161616', iconUrl: lobe(theme, 'moonshot.png') },
    moonshotai: { label: 'Moonshot', color: '#161616', iconUrl: lobe(theme, 'moonshot.png') },
    amazon: { label: 'Amazon', color: '#ff9900', iconUrl: lobe(theme, 'aws.png') },
    aws: { label: 'Amazon', color: '#ff9900', iconUrl: lobe(theme, 'aws.png') },
    bedrock: { label: 'Amazon', color: '#ff9900', iconUrl: lobe(theme, 'bedrock.png') },
    azure: { label: 'Azure', color: '#0078d4', iconUrl: lobe(theme, 'azure.png') },
    azureai: { label: 'Azure', color: '#0078d4', iconUrl: lobe(theme, 'azureai.png') },
    microsoft: { label: 'Microsoft', color: '#00a4ef', iconUrl: lobe(theme, 'microsoft.png') },
    together: { label: 'Together', color: '#0f6fff', iconUrl: lobe(theme, 'together.png') },
    togethercomputer: { label: 'Together', color: '#0f6fff', iconUrl: lobe(theme, 'together.png') },
    fireworks: { label: 'Fireworks', color: '#5019c5', iconUrl: lobe(theme, 'fireworks.png') },
    'fireworks-ai': { label: 'Fireworks', color: '#5019c5', iconUrl: lobe(theme, 'fireworks.png') },
    huggingface: { label: 'Hugging Face', color: '#ffd21e', iconUrl: lobe(theme, 'huggingface.png') },
    nvidia: { label: 'NVIDIA', color: '#76b900', iconUrl: lobe(theme, 'nvidia-color.png') },
    openrouter: { label: 'OpenRouter', color: '#6566f1', iconUrl: lobe(theme, 'openrouter.png') },
  };
}

/** Default map used by dark desktop chrome (back-compat for existing imports). */
const PROVIDERS = buildProviders('dark');

/** Billing gateways are not the model author. */
const GATEWAY_PROVIDER_IDS = new Set(['openrouter', 'nexus', 'assetsnexus', 'comfy']);

/**
 * Drop billing-gateway and private-subscription markers so the author slug is
 * readable. `~anthropic/claude-haiku-latest` → `anthropic/claude-haiku-latest`.
 */
export function stripGatewayPrefix(modelId: string): string {
  let s = modelId.trim().replace(/^~+/, '');
  const colon = s.indexOf(':');
  if (colon > 0 && !s.slice(0, colon).includes('/')) {
    s = s.slice(colon + 1).replace(/^~+/, '');
  }
  return s;
}

export function modelProviderPrefix(modelId: string): string {
  const core = stripGatewayPrefix(modelId);
  const slash = core.indexOf('/');
  if (slash <= 0) return '';
  // Guard a leftover leading `~` so letter badges never render as "~".
  return core.slice(0, slash).toLowerCase().replace(/^[^a-z0-9]+/, '');
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
  theme?: ProviderIconTheme;
}): ModelProviderInfo {
  const theme: ProviderIconTheme = input.theme === 'light' ? 'light' : 'dark';
  const providers = theme === 'dark' ? PROVIDERS : buildProviders('light');
  const cleanIconUrl = sanitizeProviderIconUrl(input.iconUrl);
  const rawProviderId = String(input.providerId || '').trim().toLowerCase();
  const providerId = rawProviderId && !GATEWAY_PROVIDER_IDS.has(rawProviderId) ? rawProviderId : '';
  if (cleanIconUrl) {
    const prefix = providerId || modelProviderPrefix(input.modelId) || 'model';
    return {
      prefix,
      label: providerId || prefix,
      color: '#8a96a3',
      iconUrl: cleanIconUrl,
    };
  }
  const prefix = providerId || modelProviderPrefix(input.modelId);
  if (!prefix) return { prefix: '', label: 'Model', color: '#8a96a3' };
  const known = providers[prefix];
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
