import type { NexusChatTheme } from '../theme.js';

export type HostAuthMessage = {
  type: 'auth';
  token: string;
  identity: Record<string, unknown>;
  apiBaseUrl?: string;
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

export type HostToSdkMessage =
  | HostAuthMessage
  | HostThemeMessage
  | HostLocaleMessage
  | HostRouteMessage
  | HostOpenContactMessage;

export type SdkMinimizeMessage = { type: 'minimize' };
export type SdkUnreadMessage = { type: 'unread'; count: number };
export type SdkOpenSceneMessage = { type: 'openScene'; clusterId: string };
export type SdkCloseSceneMessage = { type: 'closeScene' };
export type SdkVoiceActiveMessage = { type: 'voiceActive'; active: boolean };
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
  | SdkVrShellMessage
  | SdkScaRequiredMessage;

export type HostBridge = {
  postToHost: (msg: SdkToHostMessage) => void;
  dispose: () => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
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
      return {
        type: 'auth',
        token: value.token,
        identity: isRecord(value.identity) ? value.identity : {},
        apiBaseUrl: typeof value.apiBaseUrl === 'string' ? value.apiBaseUrl : undefined,
      };
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
    default:
      return null;
  }
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
  writePending([...readPending().filter((m) => m.type !== msg.type), msg]);
}

export function drainStashedHostMessages(): HostToSdkMessage[] {
  const queued = readPending();
  writePending([]);
  return queued;
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
