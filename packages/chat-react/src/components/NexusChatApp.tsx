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
  filterSttModelsForPicker,
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
import { applyPrefillComposer } from '../bridge/applyPrefillComposer.js';
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
import { appendComposerDraft } from '../utils/composerDraft.js';
import { openContactThread } from '../utils/openContactFlow.js';
import { ModelPicker } from './ModelPicker.js';
import {
  autoCollapseList,
  composerModelPickerVisible,
  loadDictationPrefs,
  modelAcceptsDirectAudio,
  readStoredListCollapsed,
  resolveDictationSelection,
  saveDictationPrefs,
  writeStoredListCollapsed,
  type DictationMethod,
  type DictationPrefs,
} from '../dictation/dictationPlan.js';
import { probePhoneStt } from '../dictation/phoneStt.js';
import { buildModelOverride, loadPickerModels } from '../models/loadPickerModels.js';
import type { PickerModel } from '../models/picker-types.js';
import { FileViewer, type FileViewerTab } from './FileViewer.js';
import { type WorkspaceRow } from './workspace/WorkspaceStrip.js';
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
import type { ChatIdentitySession } from '../bridge/host-bridge.js';
import { ConversationInbox } from './ConversationInbox.js';
import { loadIdentityInbox, sendWithClient } from '../inbox/loadIdentityInbox.js';
import type { InboxRow } from '../inbox/inboxRows.js';
import { loadConversationHistory } from '../utils/openContactFlow.js';
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
  identities?: ChatIdentitySession[];
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
  identities = [],
}: NexusChatAppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draftSetterRef = useRef<((text: string) => void) | null>(null);
  const pendingDraftRef = useRef('');
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
  const [listError, setListError] = useState<string | null>(null);
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [hiddenIdentityKeys, setHiddenIdentityKeys] = useState<string[]>([]);
  const [activeInboxId, setActiveInboxId] = useState<string | null>(null);
  const [voiceView, setVoiceView] = useState<'background' | 'transcript' | 'avatar'>('background');
  const [moreOpen, setMoreOpen] = useState(false);
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
  const [listCollapsed, setListCollapsed] = useState(false);
  const [dictationPrefs, setDictationPrefs] = useState<DictationPrefs | null>(null);
  const [phoneSttAvailable, setPhoneSttAvailable] = useState(true);

  const [clientToolReq, setClientToolReq] = useState<ClientToolRequest | null>(null);
  const [dataAccessPrompt, setDataAccessPrompt] = useState<DataAccessPromptModel | null>(null);
  const [elevationPrompt, setElevationPrompt] =
    useState<PermissionElevationPromptModel | null>(null);
  const [scaInfo, setScaInfo] = useState<{ authRequestId: string | null; command: string } | null>(
    null,
  );

  const registerDraftSetter = useCallback((setter: ((text: string) => void) | null) => {
    draftSetterRef.current = setter;
    if (!setter || !pendingDraftRef.current) return;
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = '';
    setter(pending);
  }, []);

  const applyComposerDraft = useCallback((text: string) => {
    const setter = draftSetterRef.current;
    if (setter) {
      setter(text);
      return;
    }
    pendingDraftRef.current = appendComposerDraft(pendingDraftRef.current, text);
  }, []);

  const activeContactId = panel?.contactId || state.selectedAgentId;
  const activeInbox = inboxRows.find((row) => row.id === activeInboxId) || null;
  const listedContact = findChatContact(state.contacts, activeContactId || activeInbox?.contactId || '') || null;
  const contact =
    listedContact ||
    (activeInbox
      ? {
          id: activeInbox.contactId || activeInbox.conversationId,
          name: activeInbox.title,
          type: activeInbox.kind === 'agent' ? ('agent' as const) : activeInbox.kind === 'human' ? ('user' as const) : ('group' as const),
          avatarUrl: activeInbox.avatarUrl,
          agentId: activeInbox.kind === 'agent' ? activeInbox.contactId : null,
        }
      : null);
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

  const reloadLists = useCallback(async () => {
    setListError(null);
    if (identities.length && client) {
      setInboxLoading(true);
      try {
        const loaded = await loadIdentityInbox({
          identities,
          hiddenKeys: hiddenIdentityKeys,
          send: sendWithClient(client as CommandClient & { updateAuth?: (next: { identity?: Record<string, unknown> }) => void }),
        });
        setInboxRows(loaded.rows);
        if (loaded.errors.length && !loaded.rows.length) setListError(loaded.errors.join(' '));
        else if (loaded.errors.length) setListError(loaded.errors[0]);
      } catch (error) {
        setListError(error instanceof Error ? error.message : 'Could not load conversations');
      } finally {
        setInboxLoading(false);
      }
      return;
    }
    try {
      await chat.loadContacts();
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not load contacts');
      return;
    }
    try {
      const rows = await chat.listConversations({ status: 'active', limit: 200 });
      setConversationRows(rows);
    } catch (error) {
      setConversationRows([]);
      setListError(error instanceof Error ? error.message : 'Could not load conversations');
    }
  }, [chat, client, identities, hiddenIdentityKeys]);

  useEffect(() => {
    void reloadLists();
  }, [reloadLists]);

  const openInboxRow = useCallback(
    async (row: InboxRow) => {
      const identity = identities.find((item) => item.key === row.identityKey);
      const region = client as (CommandClient & { updateAuth?: (next: { identity?: Record<string, unknown> }) => void }) | undefined;
      if (identity && region?.updateAuth) {
        region.updateAuth({
          identity: {
            token: identity.token,
            userId: identity.userId,
            orgId: identity.orgId,
            role: identity.role,
            deviceId: identity.deviceId,
          },
        });
      }
      setActiveInboxId(row.id);
      if (!row.conversationId || !client) return;
      try {
        await loadConversationHistory(client, chat, row.conversationId);
        await chat.streamInit({ conversationId: row.conversationId, contactId: row.contactId || undefined });
      } catch (error) {
        setListError(error instanceof Error ? error.message : 'Could not open conversation');
      }
    },
    [chat, client, identities],
  );

  useEffect(() => {
    const storage = window.localStorage;
    const stored = readStoredListCollapsed(storage);
    if (stored != null) setListCollapsed(stored);
    setDictationPrefs(loadDictationPrefs(storage));
    let cancelled = false;
    void probePhoneStt().then((available) => {
      if (!cancelled) setPhoneSttAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const threadOpen = Boolean(conversationId || activeContactId || activeInboxId);
    const narrow = window.matchMedia('(max-width: 720px)').matches;
    const next = autoCollapseList({
      stored: readStoredListCollapsed(window.localStorage),
      narrow,
      threadOpen,
    });
    if (next === true) setListCollapsed(true);
  }, [activeContactId, activeInboxId, conversationId]);

  useEffect(() => {
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
  }, [chat, client, contact?.agentId]);

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
        if (msg.type === 'prefillComposer') {
          applyPrefillComposer({
            chat,
            message: msg,
            ensureChatRoute: () => setRoute('chat'),
            applyDraft: applyComposerDraft,
          });
        }
      },
    });
    return () => bridge?.dispose();
  }, [applyComposerDraft, chat, onPostToHost]);

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

  const selectedChatModel = catalog.find((model) => model.id === selectedModelId) || null;
  const dictation = resolveDictationSelection({
    prefs: dictationPrefs,
    phoneAvailable: phoneSttAvailable,
    models: catalog,
    directSupported: modelAcceptsDirectAudio(selectedChatModel),
  });
  const sttChoices = filterSttModelsForPicker(catalog);
  const updateDictation = (next: DictationPrefs) => {
    setDictationPrefs(next);
    saveDictationPrefs(window.localStorage, next);
  };
  const toggleConversationList = () => {
    setListCollapsed((prev) => {
      const next = !prev;
      writeStoredListCollapsed(window.localStorage, next);
      return next;
    });
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
            <button
              type="button"
              className="nexus-chat__btn"
              aria-label={listCollapsed ? 'Show conversations' : 'Hide conversations'}
              aria-expanded={!listCollapsed}
              onClick={toggleConversationList}
            >
              {listCollapsed ? 'Chats' : 'Hide'}
            </button>
            <strong style={{ flex: 1 }}>{contact?.name || 'Nexus Chat'}</strong>
            {contact ? (
              <button
                type="button"
                className="nexus-chat__btn"
                aria-label="Call"
                onClick={() => {
                  setVoiceOpen(true);
                  setVoiceView('background');
                }}
              >
                Call
              </button>
            ) : null}
            <button type="button" className="nexus-chat__btn" aria-label="Config" onClick={() => setMoreOpen(true)}>
              Config
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
          {!collapsed && !listCollapsed ? (
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
              {sidebarTab === 'contacts' && identities.length ? (
                <ConversationInbox
                  identities={identities}
                  hiddenKeys={hiddenIdentityKeys}
                  rows={inboxRows}
                  loading={inboxLoading}
                  error={listError}
                  activeRowId={activeInboxId}
                  onToggleIdentity={(key) =>
                    setHiddenIdentityKeys((prev) =>
                      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
                    )
                  }
                  onOpen={(row) => void openInboxRow(row)}
                  onRetry={() => void reloadLists()}
                />
              ) : sidebarTab === 'contacts' ? (
                <>
                  {listError ? (
                    <div className="nexus-chat__banner" role="alert">
                      <span>{listError}</span>
                      <button type="button" className="nexus-chat__btn" onClick={() => void reloadLists()}>
                        Retry
                      </button>
                    </div>
                  ) : null}
                  <ContactList
                    chat={chat}
                    contacts={state.contacts}
                    conversationRows={conversationRows}
                    activeContactId={activeContactId}
                    slots={slots}
                    onActionSheet={(id) => setSheetContactId(id)}
                  />
                </>
              ) : (
                <RoomsPanel chat={chat} />
              )}
            </aside>
          ) : null}

          <main className="nexus-chat__main">
            {voiceOpen && voiceView === 'background' ? (
              <div className="nexus-chat__callbar" role="status">
                <span>{contact?.name || 'Call'}</span>
                <button type="button" className="nexus-chat__btn" onClick={() => setVoiceView('transcript')}>
                  Transcript
                </button>
                <button type="button" className="nexus-chat__btn" onClick={() => setVoiceView('avatar')}>
                  Avatar
                </button>
              </div>
            ) : null}
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
            <SubAgentsStrip
              chat={chat}
              client={client}
              turns={panel?.turns || state.turns}
            />
            <div className="nexus-chat__thread-row">
              {showVoice ? (
                <div style={voiceView === 'background' ? { display: 'none' } : undefined}>
                <VoiceLayout
                  chat={chat}
                  client={client}
                  contact={contact}
                  turns={panel?.turns || []}
                  streaming={panel?.streaming || state.streaming}
                  collapsed={voiceCollapsed}
                  view={voiceView}
                  autoStart
                  onView={setVoiceView}
                  onVoiceActive={(active) => onPostToHost?.({ type: 'voiceActive', active })}
                  onVoiceState={(state) =>
                    onPostToHost?.({
                      type: 'voiceState',
                      active: state.active,
                      muted: state.muted,
                      status: state.status,
                      title: contact?.name || 'Call',
                      avatarUrl: contact?.avatarUrl || null,
                      errorMessage: state.errorMessage,
                    })
                  }
                />
                </div>
              ) : null}
              {voiceView === 'background' || !showVoice ? (
                <ThreadView
                  turns={panel?.turns || state.turns}
                  streaming={panel?.streaming || state.streaming}
                  empty={EmptySlot ? <EmptySlot /> : undefined}
                  chat={chat}
                  conversationId={conversationId}
                  onOpenFile={openFile}
                />
              ) : null}
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
                showModelPicker={composerModelPickerVisible()}
                dictationMethod={dictation.method}
                sttModelId={dictation.sttModel?.id || dictation.sttModel?.modelRef || null}
                dictationNote={dictation.note}
                commandClient={client}
                onOpenFile={openFile}
                hideCompact
                onRegisterDraftSetter={registerDraftSetter}
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

      {moreOpen ? (
        <div className="nexus-chat__sheet" role="dialog" aria-label="Chat options">
          <div className="nexus-chat__sheet-handle" />
          <fieldset className="nexus-chat__dictation">
            <legend>Voice input</legend>
            <label>
              <input
                type="radio"
                name="dictation-method"
                checked={dictation.method === 'phone'}
                disabled={!phoneSttAvailable}
                onChange={() => updateDictation({ method: 'phone', sttModelId: dictationPrefs?.sttModelId || null })}
              />
              Phone
            </label>
            <label>
              <input
                type="radio"
                name="dictation-method"
                checked={dictation.method === 'model'}
                disabled={!sttChoices.length}
                onChange={() =>
                  updateDictation({
                    method: 'model' satisfies DictationMethod,
                    sttModelId: dictation.sttModel?.id || sttChoices[0]?.id || null,
                  })
                }
              />
              Speech model
            </label>
            {dictation.method === 'model' && sttChoices.length ? (
              <select
                aria-label="Speech model"
                value={dictation.sttModel?.id || ''}
                onChange={(event) =>
                  updateDictation({ method: 'model', sttModelId: event.target.value || null })
                }
              >
                {sttChoices.map((model) => (
                  <option key={model.id || model.modelRef} value={model.id || model.modelRef}>
                    {model.label || model.id}
                  </option>
                ))}
              </select>
            ) : null}
            <label>
              <input
                type="radio"
                name="dictation-method"
                checked={dictation.method === 'direct'}
                disabled={!modelAcceptsDirectAudio(selectedChatModel)}
                onChange={() =>
                  updateDictation({ method: 'direct', sttModelId: dictationPrefs?.sttModelId || null })
                }
              />
              Send audio to this model
            </label>
            {dictation.note ? <p className="nexus-chat__hint">{dictation.note}</p> : null}
          </fieldset>
          <button type="button" className="nexus-chat__btn" onClick={() => setConfigOpen(true)}>
            Avatar config
          </button>
          {contact ? (
            <button type="button" className="nexus-chat__btn" onClick={() => void resetThread()}>
              Reset conversation
            </button>
          ) : null}
          <button type="button" className="nexus-chat__btn" onClick={() => setWorkspacePopupOpen(true)}>
            Workspace
          </button>
          {features.modelPicker ? (
            <ModelPicker
              models={catalog}
              value={selectedModelId}
              loading={catalogLoading}
              onChange={setSelectedModelId}
            />
          ) : null}
          <SpendChip panel={panel} chat={chat} client={client} conversationId={conversationId} />
          <button type="button" className="nexus-chat__btn" onClick={() => setMoreOpen(false)}>
            Close
          </button>
        </div>
      ) : null}

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
