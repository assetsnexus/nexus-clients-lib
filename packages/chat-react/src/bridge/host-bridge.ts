import type { NexusChatTheme } from '../theme.js';

export type ChatIdentitySession = {
  key: string;
  label: string;
  userId: string;
  orgId: string | null;
  role: string | null;
  deviceId: string | null;
  token: string;
  avatarUrl: string | null;
  orgLogo: string | null;
};

export type HostAuthMessage = {
  type: 'auth';
  token: string;
  identity: Record<string, unknown>;
  apiBaseUrl?: string;
  identities?: ChatIdentitySession[];
};

export type HostThemeMessage = {
  type: 'theme';
  theme: NexusChatTheme;
};

export type HostLocaleMessage = {
  type: 'locale';
  locale: string;
};

export type HostRouteMessage = {
  type: 'route';
  route: 'chat' | 'scene';
  params?: Record<string, unknown>;
};

/**
 * Plan Part C11 — opt-in app route/screen context. Structure-only; never
 * carries field values, credentials, or message bodies.
 */
export type HostAppRouteMessage = {
  type: 'appRoute';
  /** null clears the context (user opted out or left a screen). */
  context: Record<string, unknown> | null;
};

/**
 * Plan Part W3 — native app-lock gate for wake listening (`requireUnlocked`).
 * A gate, not authentication: a wake never authorizes anything.
 */
export type HostWakeUnlockMessage = {
  type: 'wakeUnlock';
  unlocked: boolean;
};

export type HostOpenContactMessage = {
  type: 'openContact';
  contactId: string;
};

/**
 * Page tools for a native (non-DOM) host screen.
 *
 * The app ships a sitemap of screens and, for the active route, a screen pack:
 * instructions plus tool schemas. The WebView turns this into the same
 * `pageTools` rail the portal uses; `app.*` tools round-trip through
 * `clientToolCall` / `clientToolResult` to native handlers.
 */
export type HostPageSitemapEntry = {
  path: string;
  title: string;
  summary?: string;
};

export type HostPageToolSchema = {
  name: string;
  description?: string;
  parameters?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type HostPageScreen = {
  path: string;
  title: string;
  summary?: string;
  /** Instructions for this screen (shown to the model via anx.page.understand). */
  instructions?: string;
  /** Client tool schemas the model may call on this screen. */
  tools?: HostPageToolSchema[];
};

export type HostPageSitemapMessage = {
  type: 'pageSitemap';
  pages: HostPageSitemapEntry[];
};

export type HostPageScreenMessage = {
  type: 'pageScreen';
  /** null clears the screen (left a screen that had tools). */
  screen: HostPageScreen | null;
};

/** Native shell ran an `app.*` page tool; the WebView resumes the paused turn. */
export type HostClientToolResultMessage = {
  type: 'clientToolResult';
  requestId: string;
  result?: unknown;
  error?: string;
};

/**
 * Native shell's reply to a `chatCacheRequest`. `value` is the stored string on
 * a `get` hit; `keys` lists every key on a `keys` request.
 */
export type HostChatCacheResultMessage = {
  type: 'chatCacheResult';
  requestId: string;
  ok: boolean;
  value?: string | null;
  keys?: string[];
  error?: string;
};

/** Host asks the WebView to fill the composer. Never a send. */
export const HOST_PREFILL_TEXT_MAX = 4000;

export type HostPrefillComposerMessage = {
  type: 'prefillComposer';
  text: string;
  contactId?: string;
};

export type HostVoiceCommandMessage = {
  type: 'voiceCommand';
  action: 'mute' | 'hangup' | 'expand';
};

export type HostToSdkMessage =
  | HostAuthMessage
  | HostThemeMessage
  | HostLocaleMessage
  | HostRouteMessage
  | HostAppRouteMessage
  | HostWakeUnlockMessage
  | HostOpenContactMessage
  | HostPrefillComposerMessage
  | HostPageSitemapMessage
  | HostPageScreenMessage
  | HostClientToolResultMessage
  | HostChatCacheResultMessage
  | HostVoiceCommandMessage;

export type SdkMinimizeMessage = { type: 'minimize' };
export type SdkUnreadMessage = { type: 'unread'; count: number };
export type SdkOpenSceneMessage = { type: 'openScene'; clusterId: string };
export type SdkCloseSceneMessage = { type: 'closeScene' };
export type SdkVoiceActiveMessage = { type: 'voiceActive'; active: boolean };

export type SdkVoiceStateMessage = {
  type: 'voiceState';
  active: boolean;
  muted: boolean;
  status: string;
  title: string;
  avatarUrl: string | null;
  errorMessage?: string | null;
  /** Phase 7a — the open contact, so a native shell can pop out a companion. */
  contactId?: string | null;
  agentId?: string | null;
};
export type SdkReadyMessage = { type: 'ready' };

export type SdkVrShellMessage = {
  type: 'vrShell';
  action: 'lockLandscape' | 'unlockOrientation';
};

/** App SCA path: never treat HTTP 202 as success; host must complete verify-2fa. */
export type SdkScaRequiredMessage = {
  type: 'scaRequired';
  authRequestId: string | null;
  command: string;
};

/** WebView asks the native shell to run one `app.*` page tool. */
export type SdkClientToolCallMessage = {
  type: 'clientToolCall';
  requestId: string;
  name: string;
  args: Record<string, unknown>;
};

/** WebView asks the native shell to route to an app screen (anx.page.navigate). */
export type SdkNavigateMessage = {
  type: 'navigate';
  path: string;
};

/**
 * WebView asks the native shell to read/write the durable chat cache.
 *
 * The cache holds conversation-list metadata + short turn previews (never
 * message bodies). On native it lives in `AsyncStorage` (mirroring the
 * `anx_command_cache_v1:*` pattern), so the WebView's chat panel can persist
 * metadata across reloads without a browser IndexedDB hit. One request, one
 * `chatCacheResult` reply keyed by `requestId`.
 */
export type SdkChatCacheRequestMessage =
  | { type: 'chatCacheRequest'; requestId: string; op: 'get'; key: string }
  | { type: 'chatCacheRequest'; requestId: string; op: 'set'; key: string; value: string }
  | { type: 'chatCacheRequest'; requestId: string; op: 'delete'; key: string }
  | { type: 'chatCacheRequest'; requestId: string; op: 'keys' }
  | { type: 'chatCacheRequest'; requestId: string; op: 'clear' };

export type SdkToHostMessage =
  | SdkMinimizeMessage
  | SdkUnreadMessage
  | SdkOpenSceneMessage
  | SdkCloseSceneMessage
  | SdkVoiceActiveMessage
  | SdkVoiceStateMessage
  | SdkReadyMessage
  | SdkVrShellMessage
  | SdkScaRequiredMessage
  | SdkClientToolCallMessage
  | SdkNavigateMessage
  | SdkChatCacheRequestMessage;

export type HostBridge = {
  postToHost: (msg: SdkToHostMessage) => void;
  dispose: () => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function parseIdentitySessions(raw: unknown): ChatIdentitySession[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChatIdentitySession[] = [];
  for (const row of raw) {
    if (!isRecord(row) || typeof row.token !== 'string' || !row.token) continue;
    const userId = String(row.userId || '');
    if (!userId) continue;
    const orgId = row.orgId ? String(row.orgId) : null;
    out.push({
      key: String(row.key || `${userId}:${orgId || 'private'}`),
      label: String(row.label || (orgId ? 'Organization' : 'Private')),
      userId,
      orgId,
      role: row.role ? String(row.role) : null,
      deviceId: row.deviceId ? String(row.deviceId) : null,
      token: row.token,
      avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
      orgLogo: typeof row.orgLogo === 'string' ? row.orgLogo : null,
    });
  }
  return out;
}

export function parseHostMessage(raw: unknown): HostToSdkMessage | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'auth':
      if (typeof value.token !== 'string') return null;
      const identities = parseIdentitySessions(value.identities);
      return {
        type: 'auth',
        token: value.token,
        identity: isRecord(value.identity) ? value.identity : {},
        apiBaseUrl: typeof value.apiBaseUrl === 'string' ? value.apiBaseUrl : undefined,
        ...(identities ? { identities } : {}),
      };
    case 'voiceCommand':
      if (value.action !== 'mute' && value.action !== 'hangup' && value.action !== 'expand') return null;
      return { type: 'voiceCommand', action: value.action };
    case 'theme':
      return { type: 'theme', theme: isRecord(value.theme) ? (value.theme as NexusChatTheme) : {} };
    case 'locale':
      return { type: 'locale', locale: String(value.locale || 'en') };
    case 'route':
      return {
        type: 'route',
        route: value.route === 'scene' ? 'scene' : 'chat',
        params: isRecord(value.params) ? value.params : undefined,
      };
    case 'appRoute':
      return {
        type: 'appRoute',
        context: isRecord(value.context) ? value.context : null,
      };
    case 'wakeUnlock':
      return { type: 'wakeUnlock', unlocked: value.unlocked !== false };
    case 'openContact':
      return { type: 'openContact', contactId: String(value.contactId || '') };
    case 'pageSitemap':
      return { type: 'pageSitemap', pages: parseSitemapEntries(value.pages) };
    case 'pageScreen':
      return { type: 'pageScreen', screen: parsePageScreen(value.screen) };
    case 'clientToolResult': {
      const requestId = typeof value.requestId === 'string' ? value.requestId : '';
      if (!requestId) return null;
      return {
        type: 'clientToolResult',
        requestId,
        result: value.result,
        error: typeof value.error === 'string' ? value.error : undefined,
      };
    }
    case 'chatCacheResult': {
      const requestId = typeof value.requestId === 'string' ? value.requestId : '';
      if (!requestId) return null;
      return {
        type: 'chatCacheResult',
        requestId,
        ok: value.ok !== false,
        value: typeof value.value === 'string' ? value.value : value.value === null ? null : undefined,
        keys: Array.isArray(value.keys) ? value.keys.map(String) : undefined,
        error: typeof value.error === 'string' ? value.error : undefined,
      };
    }
    case 'prefillComposer':
      return parsePrefillComposer(value);
    default:
      return null;
  }
}

function parseSitemapEntries(raw: unknown): HostPageSitemapEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HostPageSitemapEntry[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const path = typeof row.path === 'string' ? row.path.trim() : '';
    if (!path) continue;
    out.push({
      path,
      title: typeof row.title === 'string' ? row.title : path,
      ...(typeof row.summary === 'string' ? { summary: row.summary } : {}),
    });
  }
  return out;
}

function parseToolSchema(raw: unknown): HostPageToolSchema | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  const params = isRecord(raw.parameters) ? raw.parameters : null;
  return {
    name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    ...(params
      ? {
          parameters: {
            type: typeof params.type === 'string' ? params.type : 'object',
            properties: isRecord(params.properties) ? params.properties : {},
            ...(Array.isArray(params.required) ? { required: params.required.map(String) } : {}),
          },
        }
      : {}),
  };
}

function parsePageScreen(raw: unknown): HostPageScreen | null {
  if (!isRecord(raw)) return null;
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  if (!path) return null;
  const tools = Array.isArray(raw.tools)
    ? raw.tools.map(parseToolSchema).filter((t): t is HostPageToolSchema => !!t)
    : [];
  return {
    path,
    title: typeof raw.title === 'string' ? raw.title : path,
    ...(typeof raw.summary === 'string' ? { summary: raw.summary } : {}),
    ...(typeof raw.instructions === 'string' ? { instructions: raw.instructions } : {}),
    ...(tools.length ? { tools } : {}),
  };
}

function parsePrefillComposer(value: Record<string, unknown>): HostPrefillComposerMessage | null {  if (typeof value.text !== 'string') return null;
  const text = value.text.slice(0, HOST_PREFILL_TEXT_MAX);
  if (!text.trim()) return null;
  const contactId =
    typeof value.contactId === 'string' && value.contactId.trim() ? value.contactId.trim() : undefined;
  return contactId ? { type: 'prefillComposer', text, contactId } : { type: 'prefillComposer', text };
}

type HostWindow = Window & {
  __ANX_PENDING_HOST_MSGS?: HostToSdkMessage[];
};

let pendingFallback: HostToSdkMessage[] = [];

function readPending(): HostToSdkMessage[] {
  if (typeof window === 'undefined') return pendingFallback;
  return (window as HostWindow).__ANX_PENDING_HOST_MSGS || [];
}

function writePending(next: HostToSdkMessage[]): void {
  if (typeof window === 'undefined') {
    pendingFallback = next;
    return;
  }
  (window as HostWindow).__ANX_PENDING_HOST_MSGS = next;
}

export function stashHostMessage(msg: HostToSdkMessage): void {
  // Results and prefills must not be coalesced by type: concurrent client-tool
  // results and multiple drafts would otherwise drop entries.
  if (msg.type === 'clientToolResult' || msg.type === 'chatCacheResult') return;
  const pending = readPending();
  // One slot per type. The inject script and each bridge listener both stash,
  // so appending prefills would replay the same draft more than once.
  writePending([...pending.filter((m) => m.type !== msg.type), msg]);
}

export function drainStashedHostMessages(): HostToSdkMessage[] {
  const queued = readPending();
  // Leave prefills queued. The shell bridge mounts first and would otherwise
  // swallow them before NexusChatApp applies the composer draft.
  writePending(queued.filter((m) => m.type === 'prefillComposer'));
  return queued;
}

export function dropStashedHostMessage(type: HostToSdkMessage['type']): void {
  writePending(readPending().filter((m) => m.type !== type));
}

export function createHostBridge(input: {
  postToHost: (msg: SdkToHostMessage) => void;
  onFromHost: (msg: HostToSdkMessage) => void;
  targetOrigin?: string;
}): HostBridge {
  const handler = (event: MessageEvent) => {
    if (input.targetOrigin && event.origin !== input.targetOrigin) return;
    const msg = parseHostMessage(event.data);
    if (msg) {
      stashHostMessage(msg);
      input.onFromHost(msg);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handler);
    for (const pending of drainStashedHostMessages()) {
      input.onFromHost(pending);
    }
  }
  return {
    postToHost: input.postToHost,
    dispose: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('message', handler);
      }
    },
  };
}

export function listenWindowMessages(
  onFromHost: (msg: HostToSdkMessage) => void,
  targetOrigin?: string,
): () => void {
  const bridge = createHostBridge({
    postToHost: () => {},
    onFromHost,
    targetOrigin,
  });
  return () => bridge.dispose();
}
