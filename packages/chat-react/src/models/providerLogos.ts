/** Provider prefix → small icon + display helpers (same mapping as oc-controller). */

export type ModelProviderInfo = {
  prefix: string;
  label: string;
  color: string;
  iconUrl?: string;
};

const LOBE = 'https://cdn.jsdelivr.net/gh/lobehub/lobe-icons@latest/packages/static-png/dark';

const PROVIDERS: Record<string, Omit<ModelProviderInfo, 'prefix'>> = {
  deepseek: { label: 'DeepSeek', color: '#4d6bfe', iconUrl: `${LOBE}/deepseek.png` },
  openai: { label: 'OpenAI', color: '#10a37f', iconUrl: `${LOBE}/openai.png` },
  anthropic: { label: 'Anthropic', color: '#d4a27f', iconUrl: `${LOBE}/anthropic.png` },
  google: { label: 'Google', color: '#4285f4', iconUrl: `${LOBE}/gemini-color.png` },
  gemini: { label: 'Google', color: '#4285f4', iconUrl: `${LOBE}/gemini-color.png` },
  'meta-llama': { label: 'Meta', color: '#0668e1', iconUrl: `${LOBE}/meta-color.png` },
  meta: { label: 'Meta', color: '#0668e1', iconUrl: `${LOBE}/meta-color.png` },
  mistralai: { label: 'Mistral', color: '#ff7000', iconUrl: `${LOBE}/mistral.png` },
  mistral: { label: 'Mistral', color: '#ff7000', iconUrl: `${LOBE}/mistral.png` },
  qwen: { label: 'Qwen', color: '#615ced', iconUrl: `${LOBE}/qwen-color.png` },
  xai: { label: 'xAI', color: '#e8e8e8', iconUrl: `${LOBE}/xai.png` },
  cohere: { label: 'Cohere', color: '#39594d', iconUrl: `${LOBE}/cohere-color.png` },
  perplexity: { label: 'Perplexity', color: '#22b8cd', iconUrl: `${LOBE}/perplexity-color.png` },
  amazon: { label: 'Amazon', color: '#ff9900' },
  microsoft: { label: 'Microsoft', color: '#00a4ef' },
  nvidia: { label: 'NVIDIA', color: '#76b900' },
  openrouter: { label: 'OpenRouter', color: '#8b5cf6' },
};

const RECENT_KEY = 'nexus-chat-model-recent';
const RECENT_MAX = 5;

export function stripGatewayPrefix(modelId: string): string {
  const s = modelId.trim();
  const colon = s.indexOf(':');
  if (colon > 0 && !s.slice(0, colon).includes('/')) {
    return s.slice(colon + 1);
  }
  return s;
}

export function modelProviderPrefix(modelId: string, providerId?: string | null): string {
  if (providerId && String(providerId).trim()) {
    return String(providerId).trim().toLowerCase();
  }
  const core = stripGatewayPrefix(modelId);
  const slash = core.indexOf('/');
  if (slash <= 0) return '';
  return core.slice(0, slash).toLowerCase();
}

export function modelDisplayName(modelId: string, displayName?: string | null): string {
  if (displayName && displayName.trim()) return displayName.trim();
  const core = stripGatewayPrefix(modelId);
  const slash = core.lastIndexOf('/');
  return slash >= 0 ? core.slice(slash + 1) : core || modelId;
}

export function resolveModelProvider(
  modelId: string,
  providerId?: string | null,
): ModelProviderInfo {
  const prefix = modelProviderPrefix(modelId, providerId);
  if (!prefix) {
    return { prefix: '', label: 'Model', color: '#8a96a3' };
  }
  const known = PROVIDERS[prefix];
  if (known) return { prefix, ...known };
  return { prefix, label: prefix, color: hashColor(prefix) };
}

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 42% 55%)`;
}

export function formatIntelScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

export function intelTone(value: number | null | undefined): 'low' | 'mid' | 'high' | 'top' | 'unknown' {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 15) return 'low';
  if (value < 30) return 'mid';
  if (value < 45) return 'high';
  return 'top';
}

export function formatCreditsPerM(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value <= 0) return 'free';
  if (value < 1) return `${value.toFixed(2)} cr`;
  if (value < 10) return `${value.toFixed(1)} cr`;
  return `${Math.round(value)} cr`;
}

export function priceTone(value: number | null | undefined): 'free' | 'low' | 'mid' | 'high' | 'unknown' {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value <= 0) return 'free';
  if (value < 10) return 'low';
  if (value < 80) return 'mid';
  return 'high';
}

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
