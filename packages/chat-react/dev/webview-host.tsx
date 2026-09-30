import {
  StrictMode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  NexusChatApp,
  createNexusChat,
  createHostBridge,
  createRegionCommandClient,
  openContactThread,
  type HostToSdkMessage,
  type SdkToHostMessage,
  type NexusChat,
} from '@nexus/chat-react';

type AuthState = {
  token: string;
  identity: Record<string, unknown>;
  apiBaseUrl: string;
};

type SceneRouteState = {
  open: boolean;
  clusterId: string | null;
};

const ClusterSceneLazy = lazy(async () => {
  const mod = await import('@nexus/cluster-scene-react');
  const { createLocalSceneClient } = await import('@nexus/scene-client');
  return {
    default: function AppClusterScene(props: {
      client: { send: (command: string, payload?: Record<string, unknown>) => Promise<unknown> };
      clusterId: string | null;
      onVrShellRequest: (action: 'lockLandscape' | 'unlockOrientation') => void;
    }) {
      return (
        <mod.ClusterSceneApp
          listClusters={(filters) => mod.listClustersFromCommand(props.client, filters)}
          createSceneClient={(roomId) => createLocalSceneClient({ roomId })}
          initialClusterId={props.clusterId}
          phoneVrEnabled
          onVrShellRequest={props.onVrShellRequest}
          resolveOccupants={(cluster) => [
            {
              id: 'you',
              label: 'You',
              slotIndex: 0,
              present: true,
              statusColor: 0x2dd4bf,
              mood: 'neutral',
            },
            {
              id: 'guide',
              label: `${cluster.name || cluster.id} guide`,
              slotIndex: 1,
              present: false,
              statusColor: 0x64748b,
              mood: 'neutral',
            },
          ]}
          inviteParticipant={async () => {
            /* Host can wire an existing room invite command later; no new region commands. */
          }}
        />
      );
    },
  };
});

function postToNative(msg: SdkToHostMessage) {
  const w = window as unknown as {
    __anxChatPostToHost?: (payload: unknown) => void;
    ReactNativeWebView?: { postMessage: (s: string) => void };
  };
  if (typeof w.__anxChatPostToHost === 'function') {
    w.__anxChatPostToHost(msg);
    return;
  }
  if (w.ReactNativeWebView?.postMessage) {
    w.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
}

function applyHostRoute(msg: HostToSdkMessage): SceneRouteState | null {
  if (msg.type !== 'route') return null;
  const clusterId =
    msg.params && typeof msg.params.clusterId === 'string' && msg.params.clusterId.trim()
      ? msg.params.clusterId.trim()
      : null;
  return { open: msg.route === 'scene', clusterId };
}

const chromeBtn: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #3a4654',
  background: '#1c2430',
  color: '#e8eef4',
  cursor: 'pointer',
};

function WebViewHost() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);
  const [chat, setChat] = useState<NexusChat | null>(null);
  const [client, setClient] = useState<ReturnType<typeof createRegionCommandClient> | null>(null);
  const [scene, setScene] = useState<SceneRouteState>({ open: false, clusterId: null });
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    const bridge = createHostBridge({
      postToHost: postToNative,
      onFromHost: (msg: HostToSdkMessage) => {
        if (msg.type === 'auth') {
          const apiBaseUrl =
            (typeof msg.apiBaseUrl === 'string' && msg.apiBaseUrl) ||
            (typeof msg.identity.apiBaseUrl === 'string' && msg.identity.apiBaseUrl) ||
            'http://10.0.2.2:3005';
          setAuth({
            token: msg.token,
            identity: msg.identity,
            apiBaseUrl,
          });
        }
        if (msg.type === 'openContact' && msg.contactId) {
          setPendingContactId(msg.contactId);
        }
        const nextScene = applyHostRoute(msg);
        if (nextScene) setScene(nextScene);
      },
    });
    return () => bridge.dispose();
  }, []);

  useEffect(() => {
    if (!auth) {
      setChat(null);
      setClient(null);
      return;
    }
    const identity = {
      token: auth.token,
      userId: (auth.identity.userId as string) || null,
      orgId: (auth.identity.orgId as string) || null,
      role: (auth.identity.role as string) || null,
      deviceId: (auth.identity.deviceId as string) || null,
    };
    const existing = clientRef.current;
    if (existing) {
      existing.updateAuth({ apiBaseUrl: auth.apiBaseUrl, identity });
      return;
    }
    const nextClient = createRegionCommandClient({
      apiBaseUrl: auth.apiBaseUrl,
      identity,
    });
    const next = createNexusChat({
      client: nextClient,
      features: { adminPanels: false },
      publicFilesBaseUrl: auth.apiBaseUrl,
    });
    setClient(nextClient);
    setChat(next);
  }, [auth]);

  useEffect(() => {
    if (!chat || !pendingContactId) return;
    void openContactThread(chat, pendingContactId).finally(() => setPendingContactId(null));
  }, [chat, pendingContactId]);

  const onVrShellRequest = useCallback((action: 'lockLandscape' | 'unlockOrientation') => {
    postToNative({ type: 'vrShell', action });
  }, []);

  const openScene = useCallback((clusterId?: string | null) => {
    const id = clusterId?.trim() || '';
    postToNative({ type: 'openScene', clusterId: id });
    setScene({ open: true, clusterId: id || null });
    window.postMessage(
      { type: 'route', route: 'scene', params: id ? { clusterId: id } : undefined },
      '*',
    );
  }, []);

  const closeScene = useCallback(() => {
    setScene({ open: false, clusterId: null });
    window.postMessage({ type: 'route', route: 'chat' }, '*');
    postToNative({ type: 'closeScene' });
  }, []);

  if (!auth || !chat) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#ccc', background: '#111', height: '100vh' }}>
        Waiting for auth from native shell…
      </div>
    );
  }

  const chatDockStyle: CSSProperties = scene.open
    ? {
        position: 'absolute',
        right: 12,
        bottom: 12,
        maxWidth: 360,
        maxHeight: '42vh',
        overflow: 'auto',
        zIndex: 3,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      }
    : {
        flex: 1,
        minHeight: 0,
        position: 'relative',
        zIndex: 2,
      };

  return (
    <div
      style={{
        height: '100vh',
        position: 'relative',
        background: '#0f1419',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {scene.open && client ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <button type="button" onClick={closeScene} style={chromeBtn}>
              Back to chat
            </button>
            <span style={{ color: '#9aa7b5', fontSize: 13 }}>Clusters · room · Enter VR</span>
          </div>
          <Suspense fallback={<p style={{ color: '#ccc' }}>Loading cluster room…</p>}>
            <ClusterSceneLazy
              client={client}
              clusterId={scene.clusterId}
              onVrShellRequest={onVrShellRequest}
            />
          </Suspense>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid #2a333d',
            background: '#12171c',
            flexShrink: 0,
          }}
        >
          <button type="button" onClick={() => openScene(null)} style={{ ...chromeBtn, fontWeight: 600 }}>
            Rooms / VR
          </button>
          <span style={{ color: '#9aa7b5', fontSize: 12 }}>
            Cluster list → room canvas → Enter VR
          </span>
        </div>
      )}

      <div style={chatDockStyle}>
        <NexusChatApp
          chat={chat}
          client={client || undefined}
          features={{ adminPanels: false }}
          collapsed={scene.open}
          onPostToHost={postToNative}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebViewHost />
  </StrictMode>,
);
