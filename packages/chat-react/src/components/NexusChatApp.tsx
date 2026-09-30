import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createNexusChat,
  findChatContact,
  type ChatHooks,
  type ChatModelOverride,
  type CommandClient,
  type ConversationRow,
  type CreateNexusChatOptions,
  type NexusChat,
} from '@nexus/chat-core';
import { applyThemeToElement } from '../theme.js';
import type { NexusChatTheme } from '../theme.js';
import type { ChatSlots } from '../slots.js';
import {
  coreFeaturesFromReact,
  mergeReactFeatures,
  type NexusChatReactFeatures,
} from '../features.js';
import { useChatPanel } from '../hooks/useChatState.js';
import { createSendQueue } from '../utils/sendQueue.js';
import { createHostBridge, type HostBridge, type SdkToHostMessage } from '../bridge/host-bridge.js';
import { ContactList } from './ContactList.js';
import { ThreadView } from './ThreadView.js';
import { Composer } from './Composer.js';
import { ContactActionSheet } from './ContactActionSheet.js';
import { VoiceLayout } from './VoiceLayout.js';
import { RoomsPanel } from './RoomsPanel.js';
import { ApprovalsStrip } from './ApprovalsStrip.js';
import { SubAgentsStrip } from './SubAgentsStrip.js';
import { SpendChip } from './SpendChip.js';
import { AdminRoutes } from './admin/AdminRoutes.js';
import { openContactThread } from '../utils/openContactFlow.js';
import { ModelPicker } from './ModelPicker.js';
import { buildModelOverride, loadPickerModels } from '../models/loadPickerModels.js';
import type { PickerModel } from '../models/picker-types.js';
import { FileViewer, type FileViewerTab } from './FileViewer.js';
import {
  WorkspaceStrip,
  type WorkspaceItem,
  type WorkspaceRow,
} from './workspace/WorkspaceStrip.js';
import { WorkspacePopup } from './workspace/WorkspacePopup.js';
import {
  ClientToolGrantCard,
  DataAccessPromptCard,
  PermissionElevationCard,
  ScaRequiredBanner,
  type ClientToolRequest,
  type DataAccessPromptModel,
  type PermissionElevationPromptModel,
} from './grants/GrantCards.js';
import { ConfigSheet } from './config/ConfigSheet.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';
import '../styles.css';

export type NexusChatAppProps = {
  chat?: NexusChat;
  createOptions?: CreateNexusChatOptions;
  client?: CommandClient;
  theme?: NexusChatTheme;
  slots?: ChatSlots;
  features?: Partial<NexusChatReactFeatures>;
  collapsed?: boolean;
  className?: string;
  /** Post messages to a native WebView shell. */
  onPostToHost?: (msg: SdkToHostMessage) => void;
  locale?: string;
  /** Show avatar-assets set-validation controls. */
  isAdmin?: boolean;
  currentUserId?: string | null;
};

function mapDataAccessInfo(info: unknown): DataAccessPromptModel | null {
  if (!info || typeof info !== 'object') return null;
  const row = info as Record<string, unknown>;
  const details = row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : {};
  const grantId =
    (typeof row.grantId === 'string' && row.grantId) ||
    (typeof details.grantId === 'string' && details.grantId) ||
    null;
  const resource =
    (row.resource && typeof row.resource === 'object' ? row.resource : details.resource) || {};
  const res = resource as Record<string, unknown>;
  const parents = Array.isArray(row.parents)
    ? row.parents
    : Array.isArray(details.parents)
      ? details.parents
      : [];
  const scopeChoices = [
    {
      kind: String(res.kind || 'unknown'),
      id: String(res.id || ''),
      label: String(res.name || res.id || 'This resource'),
      isLeaf: true,
    },
    ...parents
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        kind: String(p.kind || 'unknown'),
        id: String(p.id || ''),
        label: String(p.name || `${p.kind} ${p.id}`),
        isLeaf: false,
      })),
  ].filter((c) => c.id);
  if (!grantId && !scopeChoices.length) return null;
  return {
    grantId,
    message: String(row.message || row.reason || 'Data access requires your approval.'),
    access: typeof row.access === 'string' ? row.access : undefined,
    scopeChoices,
    callId: typeof row.callId === 'string' ? row.callId : null,
  };
}

export function NexusChatApp({
  chat: chatProp,
  createOptions,
  client: clientProp,
  theme,
  slots,
  features: featuresProp,
  collapsed,
  className,
  onPostToHost,
  locale: localeProp,
  isAdmin,
  currentUserId,
}: NexusChatAppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const features = useMemo(() => mergeReactFeatures(featuresProp), [featuresProp]);
  const sendQueueRef = useRef(createSendQueue());
  const [, bump] = useState(0);
  const uiHooksRef = useRef<ChatHooks>({});

  const chat = useMemo(() => {
    if (chatProp) return chatProp;
    if (!createOptions) {
      throw new Error('NexusChatApp requires `chat` or `createOptions`');
    }
    const hooks: ChatHooks = {
      ...(createOptions.hooks || {}),
      onScaRequired: (info) => {
        createOptions.hooks?.onScaRequired?.(info);
        uiHooksRef.current.onScaRequired?.(info);
      },
      onDataAccessApproval: (info) => {
        createOptions.hooks?.onDataAccessApproval?.(info);
        uiHooksRef.current.onDataAccessApproval?.(info);
      },
      onPermissionElevationRequired: (info) => {
        createOptions.hooks?.onPermissionElevationRequired?.(info);
        uiHooksRef.current.onPermissionElevationRequired?.(info);
      },
      onClientToolRequest: async (req) => {
        await createOptions.hooks?.onClientToolRequest?.(req);
        await uiHooksRef.current.onClientToolRequest?.(req);
      },
    };
    return createNexusChat({
      ...createOptions,
      hooks,
      features: { ...createOptions.features, ...coreFeaturesFromReact(features) },
    });
  }, [chatProp, createOptions, features]);

  const client = clientProp || createOptions?.client;

  const { state, panel } = useChatPanel(chat);
  const [sidebarTab, setSidebarTab] = useState<'contacts' | 'rooms'>('contacts');
  const [sheetContactId, setSheetContactId] = useState<string | null>(null);
  const [route, setRoute] = useState<'chat' | 'scene' | 'admin'>('chat');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [locale, setLocale] = useState(localeProp || 'en');
  const [activeTheme, setActiveTheme] = useState(theme);
  const [conversationRows, setConversationRows] = useState<ConversationRow[]>([]);
  const [catalog, setCatalog] = useState<PickerModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [viewerTabs, setViewerTabs] = useState<FileViewerTab[]>([]);
  const [activeViewerTabId, setActiveViewerTabId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspacePopupOpen, setWorkspacePopupOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const [clientToolReq, setClientToolReq] = useState<ClientToolRequest | null>(null);
  const [dataAccessPrompt, setDataAccessPrompt] = useState<DataAccessPromptModel | null>(null);
  const [elevationPrompt, setElevationPrompt] =
    useState<PermissionElevationPromptModel | null>(null);
  const [scaInfo, setScaInfo] = useState<{ authRequestId: string | null; command: string } | null>(
    null,
  );

  const activeContactId = panel?.contactId || state.selectedAgentId;
  const contact = findChatContact(state.contacts, activeContactId || '') || null;
  const sheetContact = findChatContact(state.contacts, sheetContactId || '') || null;
  const conversationId = panel?.conversationId || state.conversationId;

  const modelOverride: ChatModelOverride | null = useMemo(
    () => buildModelOverride(selectedModelId, catalog),
    [selectedModelId, catalog],
  );

  const handleSca = useCallback(
    (info: { authRequestId: string | null; command: string }) => {
      setScaInfo(info);
      onPostToHost?.({
        type: 'scaRequired',
        authRequestId: info.authRequestId,
        command: info.command,
      });
    },
    [onPostToHost],
  );

  useEffect(() => {
    uiHooksRef.current.onScaRequired = handleSca;
    uiHooksRef.current.onDataAccessApproval = (info) => {
      const mapped = mapDataAccessInfo(info);
      if (mapped) setDataAccessPrompt(mapped);
    };
    uiHooksRef.current.onPermissionElevationRequired = (info) => {
      setElevationPrompt(info);
    };
    uiHooksRef.current.onClientToolRequest = async (req) => {
      setClientToolReq(req);
    };
  }, [handleSca]);

  // When chat was passed in already created, merge UI hooks into createOptions.hooks if shared.
  useEffect(() => {
    if (!createOptions?.hooks) return;
    const h = createOptions.hooks;
    const prev = { ...h };
    h.onScaRequired = (info) => {
      prev.onScaRequired?.(info);
      handleSca(info);
    };
    h.onDataAccessApproval = (info) => {
      prev.onDataAccessApproval?.(info);
      const mapped = mapDataAccessInfo(info);
      if (mapped) setDataAccessPrompt(mapped);
    };
    h.onPermissionElevationRequired = (info) => {
      prev.onPermissionElevationRequired?.(info);
      setElevationPrompt(info);
    };
    h.onClientToolRequest = async (req) => {
      await prev.onClientToolRequest?.(req);
      setClientToolReq(req);
    };
    return () => {
      Object.assign(h, prev);
    };
  }, [createOptions, handleSca]);

  useEffect(() => {
    if (rootRef.current) applyThemeToElement(rootRef.current, activeTheme || {});
  }, [activeTheme]);

  useEffect(() => {
    void chat.loadContacts().then(async () => {
      try {
        const rows = await chat.listConversations({ status: 'active', limit: 200 });
        setConversationRows(rows);
      } catch {
        setConversationRows([]);
      }
    });
  }, [chat]);

  useEffect(() => {
    if (!features.modelPicker) return;
    let cancelled = false;
    setCatalogLoading(true);
    const agentId = contact?.agentId || undefined;
    const load = client
      ? loadPickerModels(client, { agentId })
      : chat.listAvailableModels(agentId ? { agentId } : undefined).then((res) =>
          res.models.map((m) => ({
            id: m.id,
            modelRef: m.modelRef,
            label: m.displayName,
            externalModelId: m.externalModelId || undefined,
            providerId: m.providerId,
            intelligenceIndex: m.intelligenceIndex,
            inputPerM: null,
            outputPerM: null,
            chatPriceCreditsPerMillion: m.chatPriceCreditsPerMillion,
            preferredHostingType: m.preferredHostingType || undefined,
            visionSupported: m.visionSupported,
            capabilities: m.capabilities,
            category: m.category,
          })),
        );
    void load
      .then((models) => {
        if (!cancelled) setCatalog(models);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chat, client, contact?.agentId, features.modelPicker]);

  useEffect(() => {
    chat.observeSubAgents({ conversationId: conversationId || null });
  }, [chat, conversationId]);

  const loadWorkspace = useCallback(async () => {
    if (!client?.send || !conversationId) {
      setWorkspace(null);
      return;
    }
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const result = (await client.send('anx.workspace.list', {
        conversationId,
      })) as {
        ok?: boolean;
        message?: string;
        data?: { items?: WorkspaceRow[]; workspaces?: WorkspaceRow[] };
        responseObject?: { items?: WorkspaceRow[]; workspaces?: WorkspaceRow[] };
      };
      if (result?.ok === false) {
        setWorkspaceError(result.message || 'Failed to list workspace');
        setWorkspace(null);
        return;
      }
      const rows =
        result?.data?.items ||
        result?.data?.workspaces ||
        result?.responseObject?.items ||
        result?.responseObject?.workspaces ||
        [];
      setWorkspace(Array.isArray(rows) && rows[0] ? rows[0] : null);
    } catch (e) {
      setWorkspaceError(e instanceof Error ? e.message : String(e));
      setWorkspace(null);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [client, conversationId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!onPostToHost) return;
    const unread = state.contacts.reduce((n, c) => n + (c.unreadCount || 0), 0);
    onPostToHost({ type: 'unread', count: unread });
  }, [onPostToHost, state.contacts]);

  useEffect(() => {
    if (!onPostToHost) return;
    let bridge: HostBridge | null = null;
    bridge = createHostBridge({
      postToHost: onPostToHost,
      onFromHost: (msg) => {
        if (msg.type === 'theme') setActiveTheme(msg.theme);
        if (msg.type === 'locale') setLocale(msg.locale);
        if (msg.type === 'route') {
          setRoute(msg.route === 'scene' ? 'scene' : 'chat');
          if (msg.route === 'scene') setVoiceOpen(true);
        }
        if (msg.type === 'openContact' && msg.contactId) {
          void openContactThread(chat, msg.contactId);
        }
      },
    });
    return () => bridge?.dispose();
  }, [chat, onPostToHost]);

  const openFile = useCallback((file: ViewerFileRef) => {
    const tabId = `${file.id}:${file.name}`;
    setViewerTabs((prev) => {
      if (prev.some((t) => t.tabId === tabId)) return prev;
      return [...prev, { ...file, tabId }];
    });
    setActiveViewerTabId(tabId);
  }, []);

  const closeViewerTab = useCallback((tabId: string) => {
    setViewerTabs((prev) => {
      const next = prev.filter((t) => t.tabId !== tabId);
      setActiveViewerTabId((active) => {
        if (active !== tabId) return active;
        return next[next.length - 1]?.tabId || null;
      });
      return next;
    });
  }, []);

  const flushQueue = useCallback(async () => {
    const q = sendQueueRef.current;
    for (const item of [...q.list()]) {
      const queuedOverride = (item.modelOverride as ChatModelOverride | undefined) || modelOverride;
      const result = await chat.sendMessage(item.text, {
        conversationId: conversationId || undefined,
        contactId: activeContactId || undefined,
        attachments: item.attachmentRefs as never,
        ...(queuedOverride ? { modelOverride: queuedOverride } : {}),
      });
      if (result.ok) q.remove(item.id);
      else q.markError(item.id, result.message);
    }
    bump((n) => n + 1);
  }, [activeContactId, chat, modelOverride, conversationId]);

  const resetThread = useCallback(async () => {
    if (!contact) return;
    const currentId = conversationId;
    const res = await chat.resetConversation(contact, currentId);
    chat.rehydrateTurns([], { conversationId: res.conversationId, detachStream: true });
    await chat.streamInit({ conversationId: res.conversationId, contactId: contact.id });
    chat.observeSubAgents({ conversationId: res.conversationId });
  }, [chat, contact, conversationId]);

  const removeWorkspaceItem = async (item: WorkspaceItem) => {
    if (!client?.send || !workspace?.id) return;
    setWorkspaceError(null);
    try {
      const result = (await client.send('anx.workspace.items.remove', {
        workspaceId: workspace.id,
        itemId: item.id,
      })) as { ok?: boolean; message?: string };
      if (result?.ok === false) {
        setWorkspaceError(result.message || 'Remove failed');
        return;
      }
      await loadWorkspace();
    } catch (e) {
      setWorkspaceError(e instanceof Error ? e.message : String(e));
    }
  };

  const HeaderSlot = slots?.header;
  const EmptySlot = slots?.empty;

  const showAdmin = features.adminPanels && route === 'admin';
  const showVoice = voiceOpen || route === 'scene';
  const voiceCollapsed = Boolean(collapsed || route === 'scene');
  const showComposer = !collapsed && route !== 'scene';

  return (
    <div
      ref={rootRef}
      className={`nexus-chat${collapsed ? ' nexus-chat--collapsed' : ''}${className ? ` ${className}` : ''}`}
      lang={locale}
    >
      <div className="nexus-chat__header">
        {HeaderSlot ? (
          <HeaderSlot chat={chat} locale={locale} />
        ) : (
          <>
            <strong style={{ flex: 1 }}>Nexus Chat</strong>
            {features.modelPicker ? (
              <ModelPicker
                models={catalog}
                value={selectedModelId}
                loading={catalogLoading}
                onChange={setSelectedModelId}
              />
            ) : null}
            <button type="button" className="nexus-chat__btn" onClick={() => setConfigOpen(true)}>
              Config
            </button>
            {contact ? (
              <button type="button" className="nexus-chat__btn" onClick={() => void resetThread()}>
                Reset
              </button>
            ) : null}
            <button
              type="button"
              className={`nexus-chat__btn${showVoice ? ' nexus-chat__btn--primary' : ''}`}
              onClick={() => setVoiceOpen((v) => !v)}
            >
              Voice
            </button>
            {features.adminPanels ? (
              <button
                type="button"
                className="nexus-chat__btn"
                onClick={() => setRoute((r) => (r === 'admin' ? 'chat' : 'admin'))}
              >
                Admin
              </button>
            ) : null}
            {onPostToHost ? (
              <button
                type="button"
                className="nexus-chat__btn"
                onClick={() => onPostToHost({ type: 'minimize' })}
              >
                −
              </button>
            ) : null}
          </>
        )}
      </div>

      {showAdmin ? (
        <AdminRoutes />
      ) : (
        <div className="nexus-chat__shell">
          {!collapsed ? (
            <aside className="nexus-chat__sidebar">
              <div className="nexus-chat__tabs">
                <button
                  type="button"
                  className={`nexus-chat__tab${sidebarTab === 'contacts' ? ' nexus-chat__tab--active' : ''}`}
                  onClick={() => setSidebarTab('contacts')}
                >
                  Contacts
                </button>
                {features.groups ? (
                  <button
                    type="button"
                    className={`nexus-chat__tab${sidebarTab === 'rooms' ? ' nexus-chat__tab--active' : ''}`}
                    onClick={() => setSidebarTab('rooms')}
                  >
                    Rooms
                  </button>
                ) : null}
              </div>
              {sidebarTab === 'contacts' ? (
                <ContactList
                  chat={chat}
                  contacts={state.contacts}
                  conversationRows={conversationRows}
                  activeContactId={activeContactId}
                  slots={slots}
                  onActionSheet={(id) => setSheetContactId(id)}
                />
              ) : (
                <RoomsPanel chat={chat} />
              )}
            </aside>
          ) : null}

          <main className="nexus-chat__main">
            <SpendChip
              panel={panel}
              chat={chat}
              client={client}
              conversationId={conversationId}
            />
            <ScaRequiredBanner info={scaInfo} />
            {clientToolReq ? (
              <ClientToolGrantCard
                request={clientToolReq}
                chat={chat}
                onResolved={() => setClientToolReq(null)}
              />
            ) : null}
            {dataAccessPrompt ? (
              <DataAccessPromptCard
                prompt={dataAccessPrompt}
                client={client}
                onResponded={() => setDataAccessPrompt(null)}
                onSca={handleSca}
              />
            ) : null}
            {elevationPrompt ? (
              <PermissionElevationCard
                prompt={elevationPrompt}
                client={client}
                onResponded={() => setElevationPrompt(null)}
                onSca={handleSca}
              />
            ) : null}
            <ApprovalsStrip chat={chat} turns={panel?.turns || state.turns} />
            <div className="nexus-chat__toolbar-row">
              <SubAgentsStrip
                chat={chat}
                client={client}
                turns={panel?.turns || state.turns}
              />
            </div>
            <WorkspaceStrip
              items={workspace?.items || []}
              loading={workspaceLoading}
              error={workspaceError}
              onOpenPopup={() => setWorkspacePopupOpen(true)}
              onOpenItem={(item) =>
                openFile({
                  id: item.fileId || item.id,
                  name: item.label || item.fileId || item.id,
                  mimeType: item.mimeType,
                  url: item.url || item.previewUrl || item.downloadUrl,
                  downloadUrl: item.downloadUrl || item.url,
                })
              }
              onRemoveItem={(item) => void removeWorkspaceItem(item)}
            />
            <div className="nexus-chat__thread-row">
              {showVoice ? (
                <VoiceLayout
                  chat={chat}
                  client={client}
                  contact={contact}
                  turns={panel?.turns || []}
                  streaming={panel?.streaming || state.streaming}
                  collapsed={voiceCollapsed}
                  onVoiceActive={(active) => onPostToHost?.({ type: 'voiceActive', active })}
                />
              ) : (
                <ThreadView
                  turns={panel?.turns || state.turns}
                  streaming={panel?.streaming || state.streaming}
                  empty={EmptySlot ? <EmptySlot /> : undefined}
                  chat={chat}
                  conversationId={conversationId}
                  onOpenFile={openFile}
                />
              )}
              <FileViewer
                tabs={viewerTabs}
                activeTabId={activeViewerTabId}
                onSelectTab={setActiveViewerTabId}
                onCloseTab={closeViewerTab}
              />
            </div>
            {showComposer ? (
              <Composer
                chat={chat}
                contacts={state.contacts}
                conversationId={conversationId}
                contactId={activeContactId}
                streaming={panel?.streaming || state.streaming}
                slots={slots}
                sendQueue={sendQueueRef.current}
                onFlushQueue={() => void flushQueue()}
                models={catalog}
                modelsLoading={catalogLoading}
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
                modelOverride={modelOverride}
                showModelPicker={false}
                onOpenFile={openFile}
                hideCompact
              />
            ) : null}
          </main>
        </div>
      )}

      {sheetContact ? (
        <ContactActionSheet
          contact={sheetContact}
          chat={chat}
          client={client}
          onClose={() => setSheetContactId(null)}
        />
      ) : null}

      <WorkspacePopup
        open={workspacePopupOpen}
        client={client}
        conversationId={conversationId}
        workspace={workspace}
        loading={workspaceLoading}
        error={workspaceError}
        onClose={() => setWorkspacePopupOpen(false)}
        onChanged={() => void loadWorkspace()}
        onError={(message) => setWorkspaceError(message)}
        onOpenItem={(item) =>
          openFile({
            id: item.fileId || item.id,
            name: item.label || item.fileId || item.id,
            mimeType: item.mimeType,
            url: item.url || item.previewUrl || item.downloadUrl,
            downloadUrl: item.downloadUrl || item.url,
          })
        }
        onUpload={() => {
          /* Composer attach is the upload path; keep popup for list/create/remove/unlink. */
          setWorkspacePopupOpen(false);
        }}
      />

      <ConfigSheet
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        client={client}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />
    </div>
  );
}
