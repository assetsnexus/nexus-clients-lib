import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createNexusChat,
  conversationHighlightsAgent,
  filterConversationsForLockedAgent,
  findChatContact,
  isUnreachableLabel,
  parseLockedAgent,
  type ConversationListMode,
  resolveReasoningEffortLevels,
  sessionErrorAfterFailure,
  type ChatHooks,
  type ChatModelOverride,
  type CommandClient,
  type ConversationRow,
  type CreateNexusChatOptions,
  type FallbackChatTransport,
  type HostPageContext,
  type AppRouteContext,
  type PageToolSource,
  type ChatToolDescriptor,
  type UserChoiceQuestion,
  type LockedAgent,
  type NexusChat,
  type ReasoningEffortLevel,
  type ActivityEvent,
  type ActivityEventData,
  filterSttModelsForPicker,
  listAudioModels,
  modelSupportsSttStream,
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
import { useOutgoingQueue } from '../hooks/useOutgoingQueue.js';
import { applyPrefillComposer } from '../bridge/applyPrefillComposer.js';
import { createHostBridge, type HostBridge, type SdkToHostMessage } from '../bridge/host-bridge.js';
import {
  applyClientToolsProps,
  applyPageToolsProp,
  applyToolsProps,
  type ClientToolProp,
} from '../page-tools/apply-page-tools-props.js';
import { ContactList } from './ContactList.js';
import { ThreadView } from './ThreadView.js';
import { Composer } from './Composer.js';
export type { ComposerControls, ComposerCallMode } from './composerHost.js';
import { FundingQuickSelect } from './FundingQuickSelect.js';
import {
  applyAccessDecision,
  applyTurnFailure,
  createAgentAccessClient,
  initialFundingGate,
  selectFunding,
  type FundingGateState,
} from '@nexus/chat-core';
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
import { PendingPauseCardView } from './grants/PendingPauseCards.js';
import { AskUserChoiceWidget, PlanCardView, planFromPointer } from './AskUserChoiceWidget.js';
import {
  ClientToolGrantCard,
  DataAccessPromptCard,
  PermissionElevationDock,
  ScaRequiredBanner,
  type ClientToolRequest,
  type DataAccessPromptModel,
  type PermissionElevationPromptModel,
} from './grants/GrantCards.js';
import {
  pendingElevationPrompts,
  unwrapElevationList,
  upsertElevationPrompt,
} from '../grants/pending-elevation.js';
import { ConfigSheet } from './config/ConfigSheet.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';
import type { ChatIdentitySession } from '../bridge/host-bridge.js';
import { ConversationInbox, type InboxRowAction, type NewConversationKind } from './ConversationInbox.js';
import { ContactPickerOverlay, type ContactPickerSelection } from '../inbox/ContactPickerOverlay.js';
import { CreateRoomDialog, type CreateRoomSubmit } from '../inbox/CreateRoomDialog.js';
import { startAgentThread, startDirectMessage, createGroupRoom, dmResumeIndex } from '../inbox/startConversation.js';
import { filterInboxRowsForLockedAgent } from '../inbox/inboxRows.js';
import { readAutoVoice, writeAutoVoice } from '../chrome/auto-voice.js';
import { applyTextScaleToElement, readTextScaleDelta, writeTextScaleDelta } from '../chrome/text-scale.js';
import { resolveChatChrome } from '../chrome/chat-chrome.js';
import { WorkingOnStrip } from './WorkingOnStrip.js';
import { PermissionSummaryCard } from './PermissionSummaryCard.js';
import { permissionSummaryIsEmpty, buildPermissionSummary, workingOnRunsFromTurns } from '../chrome/chat-chrome-cards.js';
import { chatFailureInfo, lockedEmbedPresentation } from '../chrome/locked-embed.js';
import { ContextCostMeters } from '../chrome/ContextCostMeters.js';
import { coerceReasoningEffort } from '../chrome/reasoning-slider.js';
import { ReasoningEffortControl } from '../chrome/ReasoningEffortControl.js';
import { UsageChrome } from '../chrome/UsageChrome.js';
import { resolveEffectivePickerModel } from '../chrome/advanced-model-facts.js';
import type { DictationModel } from '../dictation/dictationPlan.js';
import { mergeInboxAgentAvatars, inboxRowsFromConversationRows } from '../inbox/inboxRows.js';
import { CachedAvatarImage } from './CachedAvatarImage.js';
import { loadIdentityInbox, sendWithClient } from '../inbox/loadIdentityInbox.js';
import type { InboxRow } from '../inbox/inboxRows.js';
import { ownerContactIdForRow } from '../inbox/inboxRows.js';
import { loadThreadHistory } from '../inbox/loadThreadHistory.js';
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
  /**
   * Hand the resolved `NexusChat` controller to the host once it exists (either
   * the `chat` prop or the internally-built controller). Lets a host render
   * chrome that needs to read live panel state — tool runs, turns, usage —
   * without forcing it to build the controller itself. Called on every
   * identity change of the controller and `null`-safe to ignore.
   */
  onChatReady?: (chat: NexusChat) => void;
  /**
   * `column` is one thread and composer. Context, cost, and model selection
   * stay behind a collapsed Advanced control. No contact chrome.
   */
  layout?: 'app' | 'column';
  /** Post messages to a native WebView shell. */
  onPostToHost?: (msg: SdkToHostMessage) => void;
  /**
   * Raw user-inbox activity events (new message, generation beat, unread change).
   * A native host uses it to raise an OS notification for a background agent
   * message (self-wake / reminder) that lands while its window is unattended.
   */
  onInboxEvent?: (event: ActivityEvent) => void;
  locale?: string;
  /** Show avatar-assets set-validation controls. */
  isAdmin?: boolean;
  currentUserId?: string | null;
  identities?: ChatIdentitySession[];
  /** When set, resolve caller-paid access and show FundingQuickSelect above the composer. */
  agentTarget?: import('@nexus/chat-core').AgentAccessTarget | null;
  /**
   * Talk only to this virtual employee. Hides contacts, rooms, new DMs, and
   * the contact sheet. Forwarded into `createNexusChat` when this component
   * builds the controller.
   */
  lockedAgent?: LockedAgent | null;
  /**
   * Full list, with rows for this virtual employee marked.
   * Other agents, people, and groups stay visible.
   */
  highlightAgentId?: string | null;
  /**
   * `sidebar` is the portal list. `hidden` is a locked column with no list.
   * `drawer` keeps the column and opens the same list, filtered to `lockedAgent`.
   * Omitted: hidden when locked, otherwise sidebar.
   */
  conversationList?: ConversationListMode;
  /**
   * Structured context from the host page. Optional. When it includes a
   * project id, later sends carry that id. A context brain may set the same
   * fields. Omit it when the page has no project.
   */
  pageContext?: HostPageContext | null;
  /**
   * Standing client tools registered on the controller. The React host builds
   * the controller internally, so this is the entry point for `registerTool`
   * when a `client` is passed. They survive a `lockedAgent` / `features` rebuild.
   */
  tools?: Array<{
    descriptor: ChatToolDescriptor;
    handler: (args: unknown) => Promise<unknown> | unknown;
  }>;
  /**
   * Client tools declared by shape; `availability: 'discoverable'` keeps the
   * schema off the wire and binds it on demand. Re-registered on prop change.
   */
  clientTools?: ClientToolProp[] | null;
  /**
   * Page tools for the open screen (sitemap search, navigation, per-screen
   * instructions with tool calls). Swapped with `setPageTools` when the route
   * changes, without rebuilding the controller.
   */
  pageTools?: PageToolSource | null;
  /**
   * How the data-access card submits a decision.
   * - `command` (default): `anx.security.data-access.respond` directly. This is
   *   hard-forbidden for OAuth **app** identities (the `anx.security.` prefix is
   *   blocked before the grant allowlist), so an app host must pass
   *   `client-tool-result`.
   * - `client-tool-result`: route the decision through
   *   `anx.communicate.client-tool.result` (`{ approved, decision, grantId }`),
   *   which the SDK already uses to resume a paused turn.
   *
   * Independent of this option, a `command` send that comes back
   * `APP_ACCESS_FORBIDDEN` falls back to the client-tool-result rail
   * automatically, so a user-session host keeps working unchanged.
   */
  dataAccessTransport?: 'command' | 'client-tool-result';
  /** Transport and open failures. Hosts use `code` for sign-in; the message is safe to show. */
  onError?: (info: { message: string; code?: string }) => void;
  /**
   * Host label. Overwrites the server agent name and the raw employee id.
   * Also applied to `lockedAgent` when that object is set.
   */
  displayName?: string;
  /** Host picture. When set, it overwrites the server avatar. Empty does not render an image. */
  avatarUrl?: string | null;
  /**
   * OpenAI-like completion used when `nexusUnavailable` is true.
   * The transport's own `nexusUnavailable` flag is what `sendMessage` reads.
   */
  fallbackTransport?: FallbackChatTransport | null;
  /** Host says Nexus cannot be used. Hides Nexus-only chrome and tool surfaces. */
  nexusUnavailable?: boolean;
  /** Login control for features the host marks as requiring Nexus. Shown while unavailable. */
  nexusLogin?: ReactNode;
  /**
   * Plan Part C5 — read-only "what can my agent do" data (capabilities, tool
   * packs, channels, masked audiences). Omitted => no card. Never grants anything.
   */
  permissionSummary?: import('../chrome/chat-chrome-cards.js').PermissionSummaryInput | null;
  /**
   * Plan Part C9 — open ledger items to show beside live agent runs. Active runs
   * are derived from the thread; omitted ledger => runs only.
   */
  workingOnLedger?: import('../chrome/chat-chrome-cards.js').WorkingOnLedgerInput[];
  /**
   * The conversation's open `ask_user_choice` question (from
   * `anx.communicate.conversations.get`). When set, the answer card renders
   * above the thread; the host clears it after the answer lands.
   */
  openQuestion?: UserChoiceQuestion | null;
  /** The conversation's active plan pointer, rendered as a compact plan card. */
  activePlan?: import('@nexus/chat-core').PlanPointer | null;
  /** Called after the question answer is submitted (host clears `openQuestion`). */
  onQuestionAnswered?: () => void;
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

const EMPTY_IDENTITIES: ChatIdentitySession[] = [];

export function NexusChatApp({
  chat: chatProp,
  createOptions,
  client: clientProp,
  theme,
  slots,
  features: featuresProp,
  collapsed,
  className,
  layout = 'app',
  onPostToHost,
  onInboxEvent,
  locale: localeProp,
  isAdmin,
  currentUserId,
  identities = EMPTY_IDENTITIES,
  agentTarget = null,
  lockedAgent: lockedAgentProp = null,
  highlightAgentId = null,
  conversationList,
  pageContext = null,
  tools: toolsProp,
  clientTools: clientToolsProp = null,
  pageTools: pageToolsProp = null,
  dataAccessTransport = 'command',
  openQuestion = null,
  activePlan = null,
  onQuestionAnswered,
  onError,
  displayName: displayNameProp,
  avatarUrl: avatarUrlProp,
  fallbackTransport = null,
  nexusUnavailable = false,
  nexusLogin = null,
  permissionSummary = null,
  workingOnLedger,
  onChatReady,
}: NexusChatAppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const sessionErrorRef = useRef<(message: string | null) => void>(() => {});
  onErrorRef.current = onError;
  const onChatReadyRef = useRef(onChatReady);
  onChatReadyRef.current = onChatReady;
  const draftSetterRef = useRef<((text: string) => void) | null>(null);
  const pendingDraftRef = useRef('');
  const features = useMemo(
    () => mergeReactFeatures(featuresProp),
    [
      featuresProp?.contacts,
      featuresProp?.groups,
      featuresProp?.aiGroups,
      featuresProp?.userDatabases,
      featuresProp?.modelPicker,
      featuresProp?.modelPricing,
      featuresProp?.publicEdgeBadges,
      featuresProp?.agentContextDetails,
      featuresProp?.agentApprovals,
      featuresProp?.encryptionModes,
      featuresProp?.spendLimits,
      featuresProp?.calls,
      featuresProp?.adminPanels,
    ],
  );
  const fallbackTransportRef = useRef(fallbackTransport);
  fallbackTransportRef.current = fallbackTransport;
  // Read through refs so a route change (new pageTools identity) does not
  // rebuild the controller; the effects below swap them in place.
  const toolsPropRef = useRef(toolsProp);
  toolsPropRef.current = toolsProp;
  const clientToolsPropRef = useRef(clientToolsProp);
  clientToolsPropRef.current = clientToolsProp;
  const pageToolsPropRef = useRef(pageToolsProp);
  pageToolsPropRef.current = pageToolsProp;
  const lockedAgent = useMemo(() => {
    const requested = lockedAgentProp ?? createOptions?.lockedAgent ?? chatProp?.lockedAgent ?? null;
    if (!requested) return null;
    const avatarUrl = avatarUrlProp !== undefined ? avatarUrlProp || undefined : requested.avatarUrl;
    return parseLockedAgent({
      ...requested,
      displayName: displayNameProp || requested.displayName,
      avatarUrl,
    });
  }, [
    lockedAgentProp?.virtualEmployeeId,
    lockedAgentProp?.displayName,
    lockedAgentProp?.avatarUrl,
    createOptions?.lockedAgent?.virtualEmployeeId,
    createOptions?.lockedAgent?.displayName,
    createOptions?.lockedAgent?.avatarUrl,
    chatProp,
    displayNameProp,
    avatarUrlProp,
  ]);
  const chrome = useMemo(
    () =>
      resolveChatChrome({
        contacts: features.contacts,
        groups: features.groups,
        lockedAgent,
        conversationList,
        highlightAgentId,
      }),
    [features.contacts, features.groups, lockedAgent, conversationList, highlightAgentId],
  );
  const uiHooksRef = useRef<ChatHooks>({});
  const reachRef = useRef({
    presence: 'offline' as 'online' | 'offline' | 'connecting' | 'error' | 'disabled' | 'edge-online' | 'edge-offline' | 'registry-offline-edge-online' | 'both-offline',
    nexusReplyDelivered: false,
    sessionError: null as string | null,
  });

  const chat = useMemo(() => {
    if (chatProp) return chatProp;
    const resolvedClient = clientProp || createOptions?.client;
    if (!resolvedClient) {
      throw new Error('NexusChatApp requires `chat`, `createOptions`, or `client`');
    }
    const hooks: ChatHooks = {
      ...(createOptions?.hooks || {}),
      onScaRequired: (info) => {
        createOptions?.hooks?.onScaRequired?.(info);
        uiHooksRef.current.onScaRequired?.(info);
      },
      onDataAccessApproval: (info) => {
        createOptions?.hooks?.onDataAccessApproval?.(info);
        uiHooksRef.current.onDataAccessApproval?.(info);
      },
      onPermissionElevationRequired: (info) => {
        createOptions?.hooks?.onPermissionElevationRequired?.(info);
        uiHooksRef.current.onPermissionElevationRequired?.(info);
      },
      onClientToolRequest: async (req) => {
        await createOptions?.hooks?.onClientToolRequest?.(req);
        await uiHooksRef.current.onClientToolRequest?.(req);
      },
      onPendingPause: (card) => {
        createOptions?.hooks?.onPendingPause?.(card);
        uiHooksRef.current.onPendingPause?.(card);
      },
      onModeChanged: (event) => {
        createOptions?.hooks?.onModeChanged?.(event);
        uiHooksRef.current.onModeChanged?.(event);
      },
      onError: (err) => {
        createOptions?.hooks?.onError?.(err);
        const info = chatFailureInfo(err);
        const reach = reachRef.current;
        const next = sessionErrorAfterFailure({
          current: reach.sessionError,
          message: info.message,
          code: info.code,
          presence: reach.presence,
          nexusReplyDelivered: reach.nexusReplyDelivered,
        });
        reach.sessionError = next;
        sessionErrorRef.current(next);
        onErrorRef.current?.(info);
      },
    };
    return createNexusChat({
      ...createOptions,
      client: resolvedClient,
      hooks,
      features: { ...createOptions?.features, ...coreFeaturesFromReact(features) },
      lockedAgent: lockedAgent ?? createOptions?.lockedAgent ?? null,
      fallbackTransport,
      // Register standing tools + page tools when this host builds the
      // controller, so a `client`-only mount can still inject in-page tools.
      tools: toolsPropRef.current?.length ? toolsPropRef.current : createOptions?.tools,
      clientTools: clientToolsPropRef.current?.length
        ? clientToolsPropRef.current
        : createOptions?.clientTools,
      pageTools: pageToolsPropRef.current ?? createOptions?.pageTools ?? null,
    });
  }, [chatProp, clientProp, createOptions, features, lockedAgent, fallbackTransport]);

  useEffect(() => {
    chat.setHostPageContext(pageContext ?? null);
  }, [chat, pageContext]);

  // Publish the resolved controller to the host so sibling chrome (e.g. a Hub
  // Companion aside reading live tool runs) can subscribe to panel state
  // without building the controller itself.
  useEffect(() => {
    onChatReadyRef.current?.(chat);
  }, [chat]);

  // Swap page tools on a route change without rebuilding the controller.
  useEffect(() => {
    applyPageToolsProp(chat, pageToolsPropRef.current ?? null);
  }, [chat, pageToolsProp]);

  // Re-register standing tools when the prop changes (a rebuilt controller
  // already received them through `tools` above).
  useEffect(() => {
    applyToolsProps(chat, toolsPropRef.current);
  }, [chat, toolsProp]);

  // Same for shape-declared client tools (pinned + discoverable).
  useEffect(() => {
    applyClientToolsProps(chat, clientToolsPropRef.current);
  }, [chat, clientToolsProp]);

  const client = clientProp || createOptions?.client;
  // Latest-value refs so the inbox-activity handler stays referentially stable
  // while still reading the current controller/list loader.
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const clientRef = useRef(client);
  clientRef.current = client;
  // Assigned once `reloadLists` exists below; the inbox handler only needs the
  // latest loader, not a dependency (which would rebuild the socket).
  const reloadListsRef = useRef<(() => Promise<void>) | null>(null);
  const [fundingGate, setFundingGate] = useState<FundingGateState>(initialFundingGate());
  useEffect(() => {
    if (!client || !agentTarget) return;
    let cancelled = false;
    const access = createAgentAccessClient(client);
    void access.resolve(agentTarget).then((outcome) => {
      if (!cancelled) setFundingGate((prev) => applyAccessDecision(prev, outcome.data));
    }).catch((error: unknown) => {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
      const status = error && typeof error === 'object' && 'httpStatus' in error ? Number((error as { httpStatus?: number }).httpStatus) : undefined;
      const switchOffer = error && typeof error === 'object' && 'switchOffer' in error
        ? (error as { switchOffer?: FundingGateState['switchOffer'] }).switchOffer
        : null;
      if (!cancelled) {
        setFundingGate((prev) => applyTurnFailure(prev, { httpStatus: status, code, switchOffer }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, agentTarget]);

  const { state, panel } = useChatPanel(chat);
  // Server-paused one-click card (Plan-write approval / mode switch / gated
  // client tool). `getPendingPause` mirrors `state.pendingPause`.
  const pendingPause = state.pendingPause ?? null;
  /**
   * Sidebar entry-point panel under the conversation list (portal
   * `#sidebar-main` keeps `session-list` always mounted; the directory and the
   * rooms panel are *entry points*, not replacements for the list).
   * `'none'` = list only.
   */
  const [sidebarTab, setSidebarTab] = useState<'none' | 'contacts' | 'rooms'>('none');
  /** New-conversation surfaces (portal `contactPickerOpen` / `agentPickerOpen` / `createRoomOpen`). */
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newConversationSaving, setNewConversationSaving] = useState(false);
  const [newConversationError, setNewConversationError] = useState<string | null>(null);
  const [roomInvite, setRoomInvite] = useState<{ token: string; expiresAt: string } | null>(null);
  /** Contact ids with an existing DM room, so the DM picker can offer "Resume". */
  const [dmResumableIds, setDmResumableIds] = useState<string[]>([]);
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
  /**
   * Title/avatar of the row the user just opened. The region returns
   * `title: null` for most agent DMs (the name comes from `agentName`), and the
   * contact store may not have the row's VE/agent id yet — this keeps the
   * header bound to the row the user clicked instead of a generic fallback.
   */
  const [selectedThread, setSelectedThread] = useState<{
    title: string;
    avatarUrl: string | null;
    contactId: string | null;
    conversationId: string | null;
    roomId: string | null;
  } | null>(null);
  /** Quickbar state: the Archive link swaps the list to archived threads. */
  const [inboxArchived, setInboxArchived] = useState(false);
  /** Composer preferences shared across panels and persisted to storage. */
  const [autoVoice, setAutoVoice] = useState(() => readAutoVoice(false));
  const [textScaleDelta, setTextScaleDelta] = useState(() => readTextScaleDelta(0));
  const [voiceView, setVoiceView] = useState<'background' | 'transcript' | 'avatar'>('background');
  const [moreOpen, setMoreOpen] = useState(false);
  const [catalog, setCatalog] = useState<PickerModel[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [audioModels, setAudioModels] = useState<DictationModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffortLevel>('xhigh');

  const [viewerTabs, setViewerTabs] = useState<FileViewerTab[]>([]);
  const [activeViewerTabId, setActiveViewerTabId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspacePopupOpen, setWorkspacePopupOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dictationPrefs, setDictationPrefs] = useState<DictationPrefs | null>(null);
  const [phoneSttAvailable, setPhoneSttAvailable] = useState(true);

  const [clientToolReq, setClientToolReq] = useState<ClientToolRequest | null>(null);
  const [dataAccessPrompt, setDataAccessPrompt] = useState<DataAccessPromptModel | null>(null);
  const [elevationPrompts, setElevationPrompts] = useState<PermissionElevationPromptModel[]>([]);
  const [scaInfo, setScaInfo] = useState<{ authRequestId: string | null; command: string } | null>(
    null,
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  sessionErrorRef.current = setSessionError;

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
  const visibleInbox = useMemo(() => {
    const rows = mergeInboxAgentAvatars(inboxRows, state.contacts);
    if (chrome.conversationList !== 'drawer' || !lockedAgent) return rows;
    return filterInboxRowsForLockedAgent(rows, lockedAgent.virtualEmployeeId);
  }, [inboxRows, state.contacts, chrome.conversationList, lockedAgent]);
  const activeInbox = visibleInbox.find((row) => row.id === activeInboxId) || null;
  /**
   * Conversations with a tool run awaiting approval, so the sidebar can flag the
   * row (portal `Approval` badge). Conversation-scoped: `ApprovalsStrip` reads the
   * same `needs_approval` runs, so the badge and the strip never disagree.
   */
  const pendingApprovalConversationIds = useMemo(() => {
    const ids = new Set<string>();
    const turns = panel?.turns?.length ? panel.turns : state.turns;
    for (const turn of turns) {
      for (const run of turn.toolEvents || []) {
        if (run.status === 'needs_approval') {
          const id = String((turn as { conversationId?: string }).conversationId || '');
          if (id) ids.add(id);
        }
      }
    }
    const openId = panel?.conversationId || state.conversationId || '';
    if (ids.size || !openId) return Array.from(ids);
    // The open conversation's own turns are the usual home for the pause; the
    // turn rows do not always carry the id, so attribute them to the open thread.
    const openHasApproval = turns.some((turn) =>
      (turn.toolEvents || []).some((run) => run.status === 'needs_approval'),
    );
    return openHasApproval ? [openId] : [];
  }, [panel?.turns, panel?.conversationId, state.turns, state.conversationId]);
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
  const historyState = state.history;
  const loadOlder = useCallback(() => {
    void chat.loadOlderHistory({ conversationId: conversationId || undefined });
  }, [chat, conversationId]);
  /**
   * Presentation source for the header while a row is opening. The region
   * returns `title: null` for most agent DMs (the name lives on `agentName`)
   * and the contact store may not have the row's VE/agent id yet, so without
   * this the header falls back to a generic "Nexus Chat" for a thread the user
   * clearly just clicked. The row the user opened wins until the contact
   * resolves.
   */
  const threadContact = useMemo(() => {
    if (!selectedThread) return null;
    const isAgent = Boolean(selectedThread.contactId);
    return {
      id: selectedThread.contactId || selectedThread.conversationId || '',
      name: selectedThread.title,
      type: (selectedThread.roomId ? 'group' : isAgent ? 'agent' : 'user') as
        | 'agent'
        | 'user'
        | 'group',
      avatarUrl: selectedThread.avatarUrl,
      agentId: null,
    };
  }, [selectedThread]);
  /**
   * True while the row the user clicked is the panel's current target. A row
   * opened from the list is the authority on its own title/avatar: the panel's
   * `contactId` can still point at the *previous* agent (a room open does not
   * clear it), and `findChatContact` would then hand the header the wrong name.
   */
  const rowTargetActive = useMemo(() => {
    if (!selectedThread) return false;
    const openConversation = panel?.conversationId || state.conversationId || '';
    const openRoom = panel?.roomId || '';
    if (!openConversation && !openRoom) return false;
    if (selectedThread.conversationId && selectedThread.conversationId === openConversation) return true;
    if (selectedThread.roomId && selectedThread.roomId === openRoom) return true;
    return false;
  }, [panel?.conversationId, panel?.roomId, selectedThread, state.conversationId]);
  const headerContact = rowTargetActive
    ? // The row's title wins; fall back to the resolved contact for a picture the
      // row did not carry (portal `sessionAvatarUrl` precedence is the reverse,
      // but the row is the only source that is guaranteed to be the open thread).
      { ...threadContact, avatarUrl: threadContact?.avatarUrl || contact?.avatarUrl || null }
    : contact || threadContact;
  // Drop the row-derived header once the panel moves to another conversation
  // (contact directory, deep link, companion popout) so a stale title cannot
  // outlive the thread it described. The row's own open is in flight while the
  // history/stream-init resolve, so a target that has not landed yet is not a
  // mismatch — only a *different* landed target clears the binding.
  useEffect(() => {
    if (!selectedThread) return;
    const openConversation = panel?.conversationId || state.conversationId || '';
    const openRoom = panel?.roomId || '';
    if (!openConversation && !openRoom) return;
    if (rowTargetActive) return;
    // A room row opens by roomId; a conversation row by conversationId. Only
    // clear when the other kind of target actually took over the panel.
    if (selectedThread.roomId && !openConversation) return;
    if (selectedThread.conversationId && !openRoom) return;
    setSelectedThread(null);
  }, [panel?.conversationId, panel?.roomId, rowTargetActive, selectedThread, state.conversationId]);
  /**
   * Row to mark in the sidebar. A row opened through the list sets
   * `activeInboxId`; a conversation opened elsewhere (contact directory,
   * companion popout, host deep link) only sets `conversationId`, so fall back
   * to matching that — otherwise the list shows nothing selected.
   */
  const activeInboxRowId = useMemo(() => {
    if (activeInboxId) return activeInboxId;
    if (!conversationId) return null;
    return visibleInbox.find((row) => row.conversationId === conversationId)?.id ?? null;
  }, [activeInboxId, conversationId, visibleInbox]);
  const presentation = lockedEmbedPresentation({
    lockedAgent,
    contactName: displayNameProp || headerContact?.name,
    contactSelected: Boolean(headerContact),
    serverAvatarUrl: headerContact?.avatarUrl,
    hostAvatarUrl: avatarUrlProp,
    fallback: nexusUnavailable,
  });
  const reasoningLevels = useMemo(() => {
    const selected = catalog.find((model) => model.id === selectedModelId);
    if (!selected) return null;
    return (
      resolveReasoningEffortLevels(
        selected.externalModelId || selected.id,
        selected.category,
        selected.capabilities,
      ) ?? []
    );
  }, [catalog, selectedModelId]);
  // Plan Part C9 — active runs + open ledger items for the "working on" strip.
  const workingOnRuns = useMemo(
    () => workingOnRunsFromTurns(panel?.turns || state.turns),
    [panel?.turns, state.turns],
  );
  // Plan Part C5 — read-only permission summary. Omitted => no card.
  const permissionCard = useMemo(
    () => (permissionSummary ? buildPermissionSummary(permissionSummary) : null),
    [permissionSummary],
  );
  const reasoningForSend = useMemo(
    () => (reasoningLevels && !reasoningLevels.length ? null : coerceReasoningEffort(reasoningEffort, reasoningLevels)),
    [reasoningEffort, reasoningLevels],
  );

  const modelOverride: ChatModelOverride | null = useMemo(
    () => buildModelOverride(selectedModelId, catalog),
    [selectedModelId, catalog],
  );
  const threadStreaming = Boolean(panel?.streaming || state.streaming);
  const focusedConversationIdRef = useRef<string | null>(null);
  focusedConversationIdRef.current = conversationId ?? null;
  /**
   * Live user-inbox handler: a background agent turn (self-wake / reminder)
   * writes a message with no per-conversation stream, so without this the sidebar
   * row stayed stale and an already-open thread stayed blank until the user
   * clicked the conversation again — unlike any normal messenger.
   *
   * Reads live state through refs (not hook deps) so it stays referentially
   * stable: the inbox socket is built once, and a handler that changes identity
   * every render would force `useOutgoingQueue` to rebuild the WebSocket.
   */
  const handleInboxActivity = useCallback(
    (event: ActivityEvent) => {
      const data: Partial<ActivityEventData> = event?.data || {};
      const conversationId = typeof data.conversationId === 'string' ? data.conversationId : '';
      if (!conversationId) return;
      const unreadDelta = typeof data.unreadDelta === 'number' ? data.unreadDelta : 0;
      const kind = typeof data.kind === 'string' ? data.kind : '';
      const isMessage = Boolean(unreadDelta) || kind === 'message' || kind === 'new_message';
      if (!isMessage) return;

      const preview = typeof data.preview === 'string' ? data.preview : '';
      setInboxRows((prev) =>
        prev.map((row) =>
          row.conversationId === conversationId
            ? {
                ...row,
                unreadCount: Math.max(0, (row.unreadCount || 0) + (unreadDelta || 0)),
                ...(preview ? { summary: preview } : {}),
                updatedAt: Date.now(),
              }
            : row,
        ),
      );
      // Focused + visible thread: render the new message live, like any
      // messenger. Otherwise refresh so the badge/preview move on their own.
      const isFocused = focusedConversationIdRef.current === conversationId;
      const documentVisible =
        typeof document === 'undefined' || document.visibilityState === 'visible';
      if (isFocused && documentVisible) {
        void loadThreadHistory({
          chat: chatRef.current,
          client: clientRef.current,
          conversationId,
          expectsContent: true,
        });
      } else {
        void reloadListsRef.current?.();
      }
      // Native shell (desktop) hook: it raises an OS notification when its
      // window is unattended. Kept last so a host error never blocks the list.
      onInboxEvent?.(event);
    },
    [chat, client, onInboxEvent],
  );
  const outgoing = useOutgoingQueue({
    chat,
    client,
    conversationId,
    contactId: activeContactId,
    contactStatus: listedContact?.contactStatus,
    streaming: threadStreaming,
    nexusUnavailable,
    fallbackTransport,
    onInboxEvent: handleInboxActivity,
  });
  reachRef.current = {
    presence: outgoing.presence,
    nexusReplyDelivered: outgoing.nexusReplyDelivered,
    sessionError,
  };
  useEffect(() => {
    if (outgoing.presence !== 'online' && !outgoing.nexusReplyDelivered) return;
    setSessionError((prev) => (prev && isUnreachableLabel(prev) ? null : prev));
  }, [outgoing.nexusReplyDelivered, outgoing.presence]);

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
      setElevationPrompts((prev) => upsertElevationPrompt(prev, info));
    };
    uiHooksRef.current.onClientToolRequest = async (req) => {
      setClientToolReq(req);
    };
  }, [handleSca]);

  // Clear dock when leaving a conversation; rehydrate pending rows on open.
  useEffect(() => {
    setElevationPrompts([]);
  }, [conversationId]);

  useEffect(() => {
    if (!presentation.mountGrants || !client?.send || !conversationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await client.send('anx.ai-agents.elevations.list', {
          conversationId,
          status: ['pending'],
        });
        if (cancelled) return;
        setElevationPrompts(pendingElevationPrompts(unwrapElevationList(result)));
      } catch {
        // Stream / next send can still surface the card; list is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presentation.mountGrants, client, conversationId]);

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
      setElevationPrompts((current) => upsertElevationPrompt(current, info));
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

  // One CSS variable on the chat root scales the whole surface; the preference
  // is persisted so a reload keeps the chosen size.
  useEffect(() => {
    applyTextScaleToElement(rootRef.current, textScaleDelta);
  }, [textScaleDelta]);

  const toggleAutoVoice = useCallback(() => {
    setAutoVoice((prev) => {
      writeAutoVoice(!prev);
      return !prev;
    });
  }, []);

  const nudgeTextScale = useCallback((next: number) => {
    setTextScaleDelta((prev) => {
      const clamped = Math.max(-2, Math.min(3, next));
      if (clamped === prev) return prev;
      writeTextScaleDelta(clamped);
      return clamped;
    });
  }, []);

  const reloadLists = useCallback(async () => {
    if (!chrome.showConversationList) return;
    const listLock = chrome.conversationList === 'drawer' ? lockedAgent : null;
    setListError(null);
    const fanOut = Boolean(identities.length && client);
    // The agent/contact directory is the one list every sidebar surface reads
    // (avatar merge, contact list, DM/agent pickers). `loadContacts` unions the
    // owned catalog (`virtual-employees.list`) with the global public-facing one
    // (`virtual-employees.list-public` — Veyla/Varic, returned to ANY
    // authenticated caller) and the region scopes both to the identity of each
    // request. It used to run ONLY on the single-identity branch, so a host that
    // passes `identities` (desktop, webview, portal) never populated the
    // directory and global public agents were invisible. Always load it first.
    try {
      await chat.loadContacts();
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not load contacts');
      // Single-identity hosts abort the list, matching prior behaviour; a
      // multi-identity host still renders the conversation rows it can.
      if (!fanOut) return;
    }
    if (fanOut) {
      setInboxLoading(true);
      try {
        const loaded = await loadIdentityInbox({
          identities,
          hiddenKeys: hiddenIdentityKeys,
          lockedAgent: listLock,
          status: inboxArchived ? 'archived' : 'active',
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
    setInboxLoading(true);
    try {
      try {
        const rows = await chat.listConversations({
          status: inboxArchived ? 'archived' : 'active',
          limit: 100,
        });
        setConversationRows(listLock ? filterConversationsForLockedAgent(rows, listLock) : rows);
        // Single-identity hosts (desktop shell, embed) have no identity list to
        // fan out over, but the sidebar is the same component. Project the plain
        // rows onto it so one identity and many identities share one design.
        setInboxRows(
          inboxRowsFromConversationRows(
            listLock ? filterConversationsForLockedAgent(rows, listLock) : rows,
            chat.getState().contacts,
          ),
        );
      } catch (error) {
        setConversationRows([]);
        setInboxRows([]);
        setListError(error instanceof Error ? error.message : 'Could not load conversations');
      }
    } finally {
      setInboxLoading(false);
    }
  }, [chat, chrome.showConversationList, chrome.conversationList, client, identities, hiddenIdentityKeys, lockedAgent?.virtualEmployeeId, inboxArchived]);
  reloadListsRef.current = reloadLists;

  useEffect(() => {
    if (chrome.conversationList === 'drawer' && !drawerOpen) return;
    void reloadLists();
  }, [reloadLists, chrome.conversationList, drawerOpen]);

  useEffect(() => {
    if (!chrome.showContactsTab && chrome.showRoomsTab) setSidebarTab('rooms');
    if (!chrome.showContactsTab && !chrome.showRoomsTab) setSidebarTab('none');
  }, [chrome.showContactsTab, chrome.showRoomsTab]);

  const openInboxRow = useCallback(
    async (row: InboxRow) => {
      if (
        lockedAgent &&
        !conversationHighlightsAgent(
          {
            virtualEmployeeId: row.virtualEmployeeId,
            agentId: row.agentId,
            contactId: row.contactId,
            id: row.contactId,
          },
          lockedAgent.virtualEmployeeId,
        )
      ) {
        return;
      }
      if (chrome.showConversationDrawer) setDrawerOpen(false);
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
      if (chrome.showConversationDrawer) setDrawerOpen(false);
      // Bind the panel to the row's agent FIRST so the header/title, call and
      // companion affordances resolve even while history is still loading — a
      // slow or empty `messages.list` must never leave the click looking dead.
      // The row itself is the title/avatar source of truth (portal parity: a
      // leftover contact-store picture for the previous agent must not win).
      const ownerContactId = ownerContactIdForRow(row, (id) =>
        findChatContact(chat.getState().contacts, id),
      );
      setSelectedThread({
        title: row.title,
        avatarUrl: row.avatarUrl,
        contactId: ownerContactId ?? row.contactId ?? null,
        conversationId: row.conversationId || null,
        roomId: row.roomId,
      });
      if (row.roomId && !row.conversationId) {
        chat.rehydrateTurns([], { roomId: row.roomId, detachStream: true });
        try {
          await chat.streamInit({ roomId: row.roomId });
        } catch (error) {
          setListError(error instanceof Error ? error.message : 'Could not open the room');
        }
        return;
      }
      if (!row.conversationId || !client) return;
      try {
        await loadThreadHistory({
          chat,
          client,
          conversationId: row.conversationId,
          expectsContent: row.messageCount > 0 || Boolean(row.summary),
        });
        await chat.streamInit({ conversationId: row.conversationId, contactId: ownerContactId });
      } catch (error) {
        setListError(error instanceof Error ? error.message : 'Could not open conversation');
      }
    },
    [chat, chrome.showConversationDrawer, client, identities, lockedAgent],
  );

  /**
   * Archive the open thread for a contact and start a fresh one. Extracted so
   * both the Config sheet and a session-list "Reset conversation" action share
   * one implementation.
   */
  const resetThreadFor = useCallback(
    async (target: { id: string }, currentId: string | null) => {
      const res = await chat.resetConversation(target, currentId || undefined);
      chat.rehydrateTurns([], { conversationId: res.conversationId, detachStream: true });
      await chat.streamInit({ conversationId: res.conversationId, contactId: target.id });
      chat.observeSubAgents({ conversationId: res.conversationId });
    },
    [chat],
  );

  /**
   * Row actions from the sidebar kebab / context menu. Each maps to the same
   * region command the portal uses, so a rename here shows up there and vice
   * versa. The list reloads afterwards instead of guessing the new state.
   */
  const handleRowAction = useCallback(
    async (action: InboxRowAction, row: InboxRow) => {
      setListError(null);
      const region = client as
        | (CommandClient & { updateAuth?: (next: { identity?: Record<string, unknown> }) => void })
        | undefined;
      const identity = identities.find((item) => item.key === row.identityKey);
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
      try {
        if (action === 'rename') {
          const title = window.prompt('Rename conversation', row.title);
          const next = (title || '').trim();
          if (!next || next === row.title) return;
          if (row.kind === 'group' || row.kind === 'room') {
            await chat.updateRoom({ roomId: row.conversationId, name: next });
          } else if (client) {
            await client.send('anx.communicate.conversations.update', {
              conversationId: row.conversationId,
              title: next,
            });
          }
        } else if (action === 'archive') {
          await chat.archiveConversation(row.conversationId);
        } else if (action === 'delete') {
          await chat.deleteConversation(row.conversationId);
        } else if (action === 'reset') {
          const owner = findChatContact(chat.getState().contacts, row.contactId || '');
          if (owner) await resetThreadFor(owner, row.conversationId);
        } else if (action === 'leave_group') {
          await chat.leaveRoom({ roomId: row.conversationId, action: 'leave' });
        }
        await reloadLists();
      } catch (error) {
        setListError(error instanceof Error ? error.message : 'The action failed');
      }
    },
    [chat, client, identities, reloadLists, resetThreadFor],
  );

  /**
   * New-conversation menu (portal `pickNew`). Each entry opens its own surface
   * rather than only switching sidebar tabs:
   *   - "Message agent"  → agent picker overlay (always a NEW thread)
   *   - "Direct message" → DM/contact picker overlay (creates a `dm` room)
   *   - "New group"      → create-room dialog
   */
  const handleNewConversation = useCallback(
    (kind: NewConversationKind) => {
      setNewConversationError(null);
      setRoomInvite(null);
      if (kind === 'new-group') {
        if (!chrome.showRoomsTab) return;
        setCreateRoomOpen(true);
        return;
      }
      if (!chrome.showContactsTab) return;
      if (kind === 'new-agent') {
        setAgentPickerOpen(true);
        return;
      }
      setContactPickerOpen(true);
      // Label the people the user can resume a thread with; a failed index just
      // means every row reads as a new conversation.
      void dmResumeIndex(chat).then(setDmResumableIds).catch(() => setDmResumableIds([]));
    },
    [chat, chrome.showContactsTab, chrome.showRoomsTab],
  );

  /** "Message agent" selection: always start a fresh thread with the agent. */
  const handleAgentPickerSelect = useCallback(
    async (selection: ContactPickerSelection) => {
      setNewConversationSaving(true);
      setNewConversationError(null);
      try {
        await startAgentThread(chat, selection.contact, { title: selection.name });
        setAgentPickerOpen(false);
        setActiveInboxId(null);
        await reloadLists();
      } catch (error) {
        setNewConversationError(error instanceof Error ? error.message : 'Could not start the conversation');
      } finally {
        setNewConversationSaving(false);
      }
    },
    [chat, reloadLists],
  );

  /**
   * "Direct message" selection: resume the existing DM thread when there is one
   * (so history is kept) and create the `dm` room otherwise. The picker's
   * "Start a new conversation" checkbox forces a fresh thread (`forceNew`),
   * matching the agent picker.
   */
  const handleContactPickerSelect = useCallback(
    async (selection: ContactPickerSelection) => {
      setNewConversationSaving(true);
      setNewConversationError(null);
      try {
        await startDirectMessage(chat, selection.contact, {
          title: selection.name,
          forceNew: selection.forceNew,
        });
        setContactPickerOpen(false);
        setActiveInboxId(null);
        await reloadLists();
      } catch (error) {
        setNewConversationError(error instanceof Error ? error.message : 'Could not start the direct message');
      } finally {
        setNewConversationSaving(false);
      }
    },
    [chat, reloadLists],
  );

  /** "New group" submit: create the room, then show an invite code or open it. */
  const handleCreateRoomSubmit = useCallback(
    async (payload: CreateRoomSubmit) => {
      setNewConversationSaving(true);
      setNewConversationError(null);
      try {
        const { roomId, inviteCode } = await createGroupRoom(chat, payload);
        setActiveInboxId(null);
        await reloadLists();
        if (inviteCode) setRoomInvite({ token: inviteCode, expiresAt: '' });
        else setCreateRoomOpen(false);
        void roomId;
      } catch (error) {
        setNewConversationError(error instanceof Error ? error.message : 'Could not create the room');
      } finally {
        setNewConversationSaving(false);
      }
    },
    [chat, reloadLists],
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
    if (nexusUnavailable) {
      setCatalog([]);
      setCatalogError(null);
      setDefaultModelId(null);
      setAudioModels([]);
      setCatalogLoading(false);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    const employeeId = contact?.virtualEmployeeId || undefined;
    const load = client
      ? loadPickerModels(client, { employeeId })
      : chat.listAvailableModels().then((res) =>
          res.models.map((m) => ({
            id: m.id,
            modelRef: m.modelRef,
            label: m.displayName,
            externalModelId: m.externalModelId || undefined,
            providerId: m.providerId,
            intelligenceIndex: m.intelligenceIndex,
            inputPerM: null,
            outputPerM: null,
            cachedPerM: null,
            cachedPerMSource: null,
            costCurrency: null,
            chatPriceCreditsPerMillion: m.chatPriceCreditsPerMillion,
            preferredHostingType: m.preferredHostingType || undefined,
            availableHostingTypes: m.availableHostingTypes || [],
            visionSupported: m.visionSupported,
            capabilities: m.capabilities,
            category: m.category,
          })),
        );
    void load
      .then((models) => {
        if (cancelled) return;
        setCatalog(models);
        setCatalogError(null);
        const listed = models as PickerModel[] & { defaultModelId?: string | null };
        setDefaultModelId(listed.defaultModelId?.trim() || null);
      })
      .catch((error) => {
        if (!cancelled) {
          setCatalog([]);
          setDefaultModelId(null);
          const message = error instanceof Error ? error.message.trim() : '';
          setCatalogError(message || 'Models could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chat, client, contact?.virtualEmployeeId, nexusUnavailable]);

  useEffect(() => {
    if (!client || nexusUnavailable) {
      setAudioModels([]);
      return;
    }
    let cancelled = false;
    void listAudioModels(client, 'stt')
      .then((rows) => {
        if (cancelled) return;
        setAudioModels(
          rows.map((row) => ({
            id: row.id,
            label: row.displayName,
            externalModelId: row.externalModelId || undefined,
            capabilities: row.capabilities?.length ? row.capabilities : ['stt'],
            category: 'stt',
            modalityTransport: row.modalityTransport,
          })),
        );
      })
      .catch((error) => {
        console.warn('anx.chat.stt models failed', error instanceof Error ? error.message : error);
        if (!cancelled) setAudioModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, nexusUnavailable]);

  useEffect(() => {
    if (nexusUnavailable) return;
    chat.observeSubAgents({ conversationId: conversationId || null });
  }, [chat, conversationId, nexusUnavailable]);

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
        // Plan Part C11 — opt-in app route/screen context (structure only).
        if (msg.type === 'appRoute') {
          chat.setAppRouteContext(msg.context as AppRouteContext | null);
        }
        // Plan Part W3 — native app-lock gate for wake listening.
        if (msg.type === 'wakeUnlock') {
          chat.setWakeUnlocked?.(msg.unlocked);
        }
        if (msg.type === 'openContact' && msg.contactId) {
          if (lockedAgent && msg.contactId !== lockedAgent.virtualEmployeeId) return;
          void openContactThread(chat, msg.contactId);
        }
        if (msg.type === 'prefillComposer') {
          const requested = msg.contactId?.trim();
          const message =
            lockedAgent && requested && requested !== lockedAgent.virtualEmployeeId
              ? { ...msg, contactId: undefined }
              : msg;
          applyPrefillComposer({
            chat,
            message,
            ensureChatRoute: () => setRoute('chat'),
            applyDraft: applyComposerDraft,
          });
        }
      },
    });
    return () => bridge?.dispose();
  }, [applyComposerDraft, chat, lockedAgent, onPostToHost]);

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

  const resetThread = useCallback(async () => {
    if (!contact) return;
    await resetThreadFor(contact, conversationId);
  }, [contact, conversationId, resetThreadFor]);

  const selectedChatModel = catalog.find((model) => model.id === selectedModelId) || null;
  const effectiveModel = resolveEffectivePickerModel(catalog, selectedModelId, defaultModelId);
  const dictation = resolveDictationSelection({
    prefs: dictationPrefs,
    phoneAvailable: phoneSttAvailable,
    models: [...catalog, ...audioModels],
    directSupported: modelAcceptsDirectAudio(selectedChatModel),
    preferWorkload: dictationPrefs?.method !== 'phone',
  });
  const sttLive = modelSupportsSttStream(dictation.sttModel);
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
  const HeaderActionsSlot = slots?.headerActions;
  const EmptySlot = slots?.empty;

  const showAdmin = features.adminPanels && route === 'admin';
  const columnTurns = panel?.turns?.length ? panel.turns : state.turns;

  const pastDrawer = chrome.showConversationDrawer && drawerOpen && !collapsed ? (
    <div className="nexus-chat__past-backdrop" role="presentation" onClick={() => setDrawerOpen(false)}>
      <aside
        className="nexus-chat__past-dialog"
        role="dialog"
        aria-label="Past conversations"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="nexus-chat__past-dialog-head">
          <strong>Past conversations</strong>
          <button type="button" className="nexus-chat__btn" onClick={() => setDrawerOpen(false)}>
            Close
          </button>
        </div>
        <ConversationInbox
          identities={identities}
          hiddenKeys={hiddenIdentityKeys}
          rows={visibleInbox}
          loading={inboxLoading}
          error={listError}
          activeRowId={activeInboxRowId}
          activityConnectionStatus={outgoing.presence}
          pendingApprovalConversationIds={pendingApprovalConversationIds}
          archivedActive={inboxArchived}
          onToggleIdentity={(key) =>
            setHiddenIdentityKeys((prev) =>
              prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
            )
          }
          onOpen={(row) => void openInboxRow(row)}
          onRetry={() => void reloadLists()}
          onOpenArchived={() => setInboxArchived((prev) => !prev)}
          onNewConversation={handleNewConversation}
          onRowAction={(action, row) => void handleRowAction(action, row)}
        />
      </aside>
    </div>
  ) : null;

  const elevationDock =
    presentation.mountGrants && elevationPrompts.length ? (
      <PermissionElevationDock
        prompts={elevationPrompts}
        client={client}
        onChange={setElevationPrompts}
        onSca={handleSca}
      />
    ) : null;

  if (layout === 'column') {
    return (
      <div
        ref={rootRef}
        className={`nexus-chat nexus-chat--column${className ? ` ${className}` : ''}`}
        lang={locale}
        data-nexus-layout="column"
      >
        <div className="nexus-chat__column-bar">
          {chrome.showConversationDrawer ? (
            <button
              type="button"
              className="nexus-chat__btn nexus-chat__past"
              aria-label="Past conversations"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((open) => !open)}
            >
              Past conversations
            </button>
          ) : (
            <span />
          )}
          <ContextCostMeters panel={panel} />
        </div>
        {pastDrawer}
        <div className="nexus-chat__column-thread">
          {workingOnRuns.length || (workingOnLedger && workingOnLedger.length) ? (
            <WorkingOnStrip runs={workingOnRuns} ledger={workingOnLedger} />
          ) : null}
          {permissionCard && !permissionSummaryIsEmpty(permissionCard) ? (
            <details className="nexus-chat__permission-card">
              <summary className="nexus-chat__chip">What this agent can do</summary>
              <PermissionSummaryCard {...(permissionSummary || {})} />
            </details>
          ) : null}
          {sessionError ? (
            <div className="nexus-chat__banner" role="alert">
              <span>{sessionError}</span>
            </div>
          ) : null}
          {presentation.mountGrants ? (
            <div data-nexus-surface="grants">
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
                  dataAccessTransport={dataAccessTransport}
                  conversationId={conversationId}
                  chat={chat}
                  onResponded={() => setDataAccessPrompt(null)}
                  onSca={handleSca}
                />
              ) : null}
              {pendingPause ? (
                <PendingPauseCardView
                  card={pendingPause}
                  chat={chat}
                  onResolved={() => undefined}
                />
              ) : null}
              {openQuestion ? (
                <AskUserChoiceWidget
                  question={openQuestion}
                  chat={chat}
                  conversationId={conversationId}
                  onAnswered={onQuestionAnswered}
                />
              ) : null}
            </div>
          ) : null}
          {activePlan ? <PlanCardView plan={planFromPointer(activePlan)} /> : null}
          {presentation.mountApprovals ? <ApprovalsStrip chat={chat} turns={columnTurns} /> : null}
          {presentation.mountSubagents ? (
            <SubAgentsStrip chat={chat} client={client} turns={columnTurns} />
          ) : null}
          <div className="nexus-chat__thread-row">
            {presentation.mountToolTimeline ? <div data-nexus-surface="tool-timeline" hidden /> : null}
            <ThreadView
              turns={columnTurns}
              streaming={panel?.streaming || state.streaming}
              empty=""
              chat={chat}
              conversationId={conversationId}
              onOpenFile={openFile}
              historyHasMore={historyState?.hasMore}
              historyLoadingMore={historyState?.loadingMore}
              onLoadOlder={loadOlder}
            />
            <FileViewer
              tabs={viewerTabs}
              activeTabId={activeViewerTabId}
              onSelectTab={setActiveViewerTabId}
              onCloseTab={closeViewerTab}
            />
          </div>
        </div>
        <div className="nexus-chat__model-row">
          {features.modelPicker ? (
            <ModelPicker
              models={catalog}
              value={selectedModelId}
              loading={catalogLoading}
              onChange={setSelectedModelId}
            />
          ) : null}
          <ReasoningEffortControl
            levels={reasoningLevels}
            value={reasoningForSend}
            onChange={setReasoningEffort}
          />
        </div>
        {catalogError ? (
          <p className="nexus-chat__muted" role="alert">
            {catalogError}
          </p>
        ) : null}
        {agentTarget ? (
          <FundingQuickSelect
            gate={fundingGate}
            onSelectFunding={(funding) => setFundingGate((prev) => selectFunding(prev, funding))}
          />
        ) : null}
        {elevationDock}
        <Composer
          chat={chat}
          contacts={state.contacts}
          conversationId={conversationId}
          contactId={activeContactId}
          streaming={threadStreaming}
          slots={slots}
          sendQueue={outgoing.queue}
          threadKey={outgoing.threadKey}
          queueBannerText={outgoing.bannerText}
          queueCount={outgoing.queueCount}
          bypassFallback={outgoing.bypassFallback}
          onFlushQueue={outgoing.retry}
          onCancelQueue={outgoing.cancel}
          onQueued={outgoing.noteQueued}
          onNexusReply={outgoing.noteNexusReply}
          onTransportFailure={outgoing.noteTransportFailure}
          models={catalog}
          modelsLoading={catalogLoading}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          modelOverride={modelOverride}
          reasoningEffort={reasoningForSend}
          reasoningLevels={reasoningLevels}
          onReasoningEffort={setReasoningEffort}
          showModelPicker={false}
          autoVoice={autoVoice}
          onToggleAutoVoice={toggleAutoVoice}
          textScaleDelta={textScaleDelta}
          onTextScaleDelta={nudgeTextScale}
          dictationMethod={dictation.method}
          sttModelId={dictation.sttModel?.id || dictation.sttModel?.modelRef || null}
          sttLive={sttLive}
          grantMissing={Boolean(nexusUnavailable)}
          dictationNote={dictation.note}
          commandClient={client}
          onOpenFile={openFile}
          hideCompact
          callsEnabled={features.calls}
          onRegisterDraftSetter={registerDraftSetter}
        />
      </div>
    );
  }

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
            {chrome.showConversationDrawer ? (
              <button
                type="button"
                className="nexus-chat__btn"
                aria-label="Past conversations"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen((open) => !open)}
              >
                Past conversations
              </button>
            ) : null}
            {chrome.showSidebar ? (
              <button
                type="button"
                className="nexus-chat__btn"
                aria-label={listCollapsed ? 'Show conversations' : 'Hide conversations'}
                aria-expanded={!listCollapsed}
                onClick={toggleConversationList}
              >
                {listCollapsed ? 'Chats' : 'Hide'}
              </button>
            ) : null}
            <strong data-nexus-title="" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {presentation.avatarUrl ? (
                <CachedAvatarImage
                  src={presentation.avatarUrl}
                  alt=""
                  className="nexus-chat__header-avatar"
                  fallback={null}
                />
              ) : null}
              <span>{presentation.title}</span>
              {permissionCard && !permissionSummaryIsEmpty(permissionCard) ? (
                <PermissionSummaryCard {...(permissionSummary || {})} compact />
              ) : null}
            </strong>
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
            {HeaderActionsSlot ? <HeaderActionsSlot chat={chat} contact={contact} /> : null}
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
          {chrome.showSidebar && !collapsed && !listCollapsed ? (
            <aside className="nexus-chat__sidebar">
              {chrome.showContactsTab || chrome.showRoomsTab ? (
                <div className="nexus-chat__tabs">
                  {chrome.showContactsTab ? (
                    <button
                      type="button"
                      className={`nexus-chat__tab${sidebarTab === 'contacts' ? ' nexus-chat__tab--active' : ''}`}
                      aria-pressed={sidebarTab === 'contacts'}
                      onClick={() =>
                        setSidebarTab((tab) => (tab === 'contacts' ? 'none' : 'contacts'))
                      }
                    >
                      Contacts
                    </button>
                  ) : null}
                  {chrome.showRoomsTab ? (
                    <button
                      type="button"
                      className={`nexus-chat__tab${sidebarTab === 'rooms' ? ' nexus-chat__tab--active' : ''}`}
                      aria-pressed={sidebarTab === 'rooms'}
                      onClick={() => setSidebarTab((tab) => (tab === 'rooms' ? 'none' : 'rooms'))}
                    >
                      Rooms
                    </button>
                  ) : null}
                </div>
              ) : null}
              <ConversationInbox
                identities={identities}
                hiddenKeys={hiddenIdentityKeys}
                rows={visibleInbox}
                loading={inboxLoading}
                error={listError}
                activeRowId={activeInboxRowId}
                highlightAgentId={chrome.highlightAgentId}
                activityConnectionStatus={outgoing.presence}
                pendingApprovalConversationIds={pendingApprovalConversationIds}
                archivedActive={inboxArchived}
                onToggleIdentity={(key) =>
                  setHiddenIdentityKeys((prev) =>
                    prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
                  )
                }
                onOpen={(row) => void openInboxRow(row)}
                onRetry={() => void reloadLists()}
                onOpenArchived={() => setInboxArchived((prev) => !prev)}
                onNewConversation={handleNewConversation}
                onRowAction={(action, row) => void handleRowAction(action, row)}
              />
              {/* Entry points below the list (portal `#sidebar-main`): the
                  directory starts a NEW DM, the rooms panel resumes a room. */}
              {sidebarTab === 'contacts' && chrome.showNewDm ? (
                <div className="nexus-chat__sidebar-entry" aria-label="Contacts">
                  <ContactList
                    chat={chat}
                    contacts={state.contacts}
                    conversationRows={conversationRows}
                    activeContactId={activeContactId}
                    highlightAgentId={chrome.highlightAgentId}
                    slots={slots}
                    onActionSheet={
                      chrome.showContactSheet ? (id) => setSheetContactId(id) : undefined
                    }
                  />
                </div>
              ) : null}
              {sidebarTab === 'rooms' && chrome.showRoomsTab ? (
                <div className="nexus-chat__sidebar-entry" aria-label="Rooms">
                  <RoomsPanel chat={chat} />
                </div>
              ) : null}
            </aside>
          ) : null}
          {pastDrawer}

          <main className="nexus-chat__main">
            {voiceOpen && voiceView === 'background' ? (
              /*
               * `Background / Transcript / Avatar` view switcher. `role="status"`
               * was wrong: it made the bar an ARIA live region, and a live region
               * must not own focusable controls (every view change would
               * re-announce the whole bar, and the buttons read as passive status
               * text rather than toggles). `role="group"` + `aria-label` is the
               * correct container for a labelled set of toggle buttons, and it
               * matches the VoiceLayout control row (`role="group"`,
               * "Voice controls"). All three views are rendered so the user can
               * both see which view is active (`aria-pressed` + `.is-on`) and
               * switch back to `Background`, which previously had no control.
               */
              <div className="nexus-chat__callbar" role="group" aria-label="Call controls">
                <span>{presentation.title}</span>
                {(
                  [
                    ['background', 'Background'],
                    ['transcript', 'Transcript'],
                    ['avatar', 'Avatar'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`nexus-chat__icon-btn nexus-chat__icon-btn--text${voiceView === id ? ' is-on' : ''}`}
                    aria-pressed={voiceView === id}
                    aria-label={label}
                    title={label}
                    onClick={() => setVoiceView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {sessionError ? (
              <div className="nexus-chat__banner" role="alert">
                <span>{sessionError}</span>
              </div>
            ) : null}
            {presentation.mountGrants ? (
            <div data-nexus-surface="grants">
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
                  dataAccessTransport={dataAccessTransport}
                  conversationId={conversationId}
                  chat={chat}
                  onResponded={() => setDataAccessPrompt(null)}
                  onSca={handleSca}
                />
              ) : null}
              {pendingPause ? (
                <PendingPauseCardView
                  card={pendingPause}
                  chat={chat}
                  onResolved={() => undefined}
                />
              ) : null}
              {openQuestion ? (
                <AskUserChoiceWidget
                  question={openQuestion}
                  chat={chat}
                  conversationId={conversationId}
                  onAnswered={onQuestionAnswered}
                />
              ) : null}
            </div>
            ) : null}
            {activePlan ? <PlanCardView plan={planFromPointer(activePlan)} /> : null}
            {presentation.mountApprovals ? (
              <ApprovalsStrip chat={chat} turns={panel?.turns || state.turns} />
            ) : null}
            {/* Plan Part C9 — active runs + open ledger items. */}
            {workingOnRuns.length || (workingOnLedger && workingOnLedger.length) ? (
              <WorkingOnStrip runs={workingOnRuns} ledger={workingOnLedger} />
            ) : null}
            {presentation.mountSubagents ? (
              <SubAgentsStrip
                chat={chat}
                client={client}
                turns={panel?.turns || state.turns}
              />
            ) : null}
            <div className="nexus-chat__thread-row">
              {presentation.mountToolTimeline ? <div data-nexus-surface="tool-timeline" hidden /> : null}
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
                      title: presentation.title,
                      avatarUrl: contact?.avatarUrl || null,
                      errorMessage: state.errorMessage,
                      contactId: contact?.id ?? null,
                      agentId: contact?.agentId ?? contact?.virtualEmployeeId ?? null,
                    })
                  }
                />
                </div>
              ) : null}
              {voiceView === 'background' || !showVoice ? (
                <ThreadView
                  turns={panel?.turns || state.turns}
                  streaming={panel?.streaming || state.streaming}
                  empty={EmptySlot ? <EmptySlot /> : presentation.empty}
                  chat={chat}
                  conversationId={conversationId}
                  onOpenFile={openFile}
                  historyHasMore={historyState?.hasMore}
                  historyLoadingMore={historyState?.loadingMore}
                  onLoadOlder={loadOlder}
                />
              ) : null}
              <FileViewer
                tabs={viewerTabs}
                activeTabId={activeViewerTabId}
                onSelectTab={setActiveViewerTabId}
                onCloseTab={closeViewerTab}
              />
            </div>
            {showComposer && agentTarget ? (
              <FundingQuickSelect
                gate={fundingGate}
                onSelectFunding={(funding) => setFundingGate((prev) => selectFunding(prev, funding))}
              />
            ) : null}
            {showComposer ? (
              <UsageChrome
                panel={panel}
                models={features.modelPicker ? catalog : []}
                modelsLoading={catalogLoading}
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
                reasoningLevels={reasoningLevels}
                reasoningEffort={reasoningForSend}
                onReasoningEffort={setReasoningEffort}
                unavailable={nexusUnavailable}
                nexusLogin={nexusLogin}
                effectiveModel={effectiveModel}
                modelsError={catalogError}
              />
            ) : null}
            {showComposer ? elevationDock : null}
            {showComposer ? (
              <Composer
                chat={chat}
                contacts={state.contacts}
                conversationId={conversationId}
                contactId={activeContactId}
                streaming={threadStreaming}
                slots={slots}
                sendQueue={outgoing.queue}
                threadKey={outgoing.threadKey}
                queueBannerText={outgoing.bannerText}
                queueCount={outgoing.queueCount}
                bypassFallback={outgoing.bypassFallback}
                onFlushQueue={outgoing.retry}
                onCancelQueue={outgoing.cancel}
                onQueued={outgoing.noteQueued}
                onNexusReply={outgoing.noteNexusReply}
                onTransportFailure={outgoing.noteTransportFailure}
                models={catalog}
                modelsLoading={catalogLoading}
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
                modelOverride={modelOverride}
                reasoningEffort={reasoningForSend}
                reasoningLevels={reasoningLevels}
                onReasoningEffort={setReasoningEffort}
                showModelPicker={composerModelPickerVisible()}
                autoVoice={autoVoice}
                onToggleAutoVoice={toggleAutoVoice}
                textScaleDelta={textScaleDelta}
                onTextScaleDelta={nudgeTextScale}
                dictationMethod={dictation.method}
                sttModelId={dictation.sttModel?.id || dictation.sttModel?.modelRef || null}
                sttLive={sttLive}
                grantMissing={Boolean(nexusUnavailable)}
                dictationNote={dictation.note}
                commandClient={client}
                onOpenFile={openFile}
                hideCompact
                callsEnabled={features.calls}
                onRegisterDraftSetter={registerDraftSetter}
              />
            ) : null}
          </main>
        </div>
      )}

      {chrome.showContactSheet && sheetContact ? (
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

      {/* New-conversation surfaces (portal host mounts both pickers + the
          create-room dialog as siblings of the panel). */}
      <ContactPickerOverlay
        open={agentPickerOpen}
        mode="agent"
        contacts={state.contacts}
        allowName
        saving={newConversationSaving}
        error={newConversationError}
        onClose={() => setAgentPickerOpen(false)}
        onSelect={(selection) => void handleAgentPickerSelect(selection)}
      />
      <ContactPickerOverlay
        open={contactPickerOpen}
        mode="dm"
        contacts={state.contacts}
        allowName
        resumableContactIds={dmResumableIds}
        saving={newConversationSaving}
        error={newConversationError}
        onClose={() => setContactPickerOpen(false)}
        onSelect={(selection) => void handleContactPickerSelect(selection)}
      />
      <CreateRoomDialog
        open={createRoomOpen}
        contacts={state.contacts}
        saving={newConversationSaving}
        error={newConversationError}
        inviteToken={roomInvite?.token}
        inviteExpiresAt={roomInvite?.expiresAt}
        onCancel={() => {
          setCreateRoomOpen(false);
          setRoomInvite(null);
          setNewConversationError(null);
        }}
        onDone={() => {
          setCreateRoomOpen(false);
          setRoomInvite(null);
        }}
        onSubmit={(payload) => void handleCreateRoomSubmit(payload)}
      />
    </div>
  );
}
