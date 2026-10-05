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

export type HostOpenContactMessage = {
  type: 'openContact';
  contactId: string;
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
  | HostOpenContactMessage
  | HostPrefillComposerMessage
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

export type SdkToHostMessage =
  | SdkMinimizeMessage
  | SdkUnreadMessage
  | SdkOpenSceneMessage
  | SdkCloseSceneMessage
  | SdkVoiceActiveMessage
  | SdkVoiceStateMessage
  | SdkReadyMessage
  | SdkVrShellMessage
  | SdkScaRequiredMessage;

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
    case 'openContact':
      return { type: 'openContact', contactId: String(value.contactId || '') };
    case 'prefillComposer':
      return parsePrefillComposer(value);
    default:
      return null;
  }
}

function parsePrefillComposer(value: Record<string, unknown>): HostPrefillComposerMessage | null {
  if (typeof value.text !== 'string') return null;
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
