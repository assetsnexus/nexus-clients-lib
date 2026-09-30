import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const dts = `import type { ComponentType, ReactNode } from 'react';
export type {
  NexusChat,
  CreateNexusChatOptions,
  ChatContact,
  ChatTurn,
  ChatFeatures,
  CommandClient,
} from '@nexus/chat-core';

export declare function createNexusChat(...args: unknown[]): import('@nexus/chat-core').NexusChat;
export declare const DEFAULT_FEATURES: import('@nexus/chat-core').ChatFeatures;
export declare function findChatContact(...args: unknown[]): import('@nexus/chat-core').ChatContact | null;

export declare const NexusChatApp: ComponentType<NexusChatAppProps>;
export type NexusChatAppProps = Record<string, unknown>;
export declare const ContactList: ComponentType<Record<string, unknown>>;
export declare const ThreadView: ComponentType<Record<string, unknown>>;
export declare const Composer: ComponentType<Record<string, unknown>>;
export declare const ContactActionSheet: ComponentType<Record<string, unknown>>;
export declare const VoiceLayout: ComponentType<Record<string, unknown>>;
export declare const RoomsPanel: ComponentType<Record<string, unknown>>;
export declare const ApprovalsStrip: ComponentType<Record<string, unknown>>;
export declare const SubAgentsStrip: ComponentType<Record<string, unknown>>;
export declare const SpendChip: ComponentType<Record<string, unknown>>;
export declare const AdminRoutes: ComponentType<Record<string, unknown>>;
export declare const ToolTimelineRow: ComponentType<Record<string, unknown>>;

export type NexusChatTheme = Record<string, unknown>;
export declare const DEFAULT_THEME: NexusChatTheme;
export declare function themeToCssVars(theme?: NexusChatTheme): Record<string, string>;
export declare function applyThemeToElement(el: HTMLElement, theme?: NexusChatTheme): void;

export type ChatSlots = {
  header?: ComponentType<any>;
  composer?: ComponentType<any>;
  empty?: ComponentType<any>;
  contactRow?: ComponentType<any>;
};

export type NexusChatReactFeatures = import('@nexus/chat-core').ChatFeatures & { adminPanels?: boolean };
export declare const DEFAULT_REACT_FEATURES: NexusChatReactFeatures;
export declare function mergeReactFeatures(partial?: Partial<NexusChatReactFeatures>): NexusChatReactFeatures;
export declare function coreFeaturesFromReact(features: NexusChatReactFeatures): import('@nexus/chat-core').ChatFeatures;

export declare function createHostBridge(input: Record<string, unknown>): { postToHost: Function; dispose: Function };
export declare function listenWindowMessages(onFromHost: Function, targetOrigin?: string): () => void;
export declare function parseHostMessage(raw: unknown): unknown;

export type ParticipantPresenceV1 = Record<string, unknown>;
export declare function parseParticipantPresenceV1(raw: unknown): ParticipantPresenceV1 | null;
export declare function mergeParticipantPresenceV1(base: ParticipantPresenceV1 | null | undefined, patch: ParticipantPresenceV1 | null | undefined): ParticipantPresenceV1;
export declare function createPresenceStore(storageKeyPrefix: string): { get: Function; set: Function; clear: Function };
export declare function readPresenceFromProfile(profileLike: unknown): ParticipantPresenceV1 | null;
export declare function writePresenceIntoProfilePatch(doc: ParticipantPresenceV1): Record<string, unknown>;

export declare function renderChatMarkdown(text: string): string;
export declare const CHAT_MARKDOWN_ROOT_CLASS: string;
export declare function sortContactsForList(contacts: import('@nexus/chat-core').ChatContact[], conversationRows?: unknown[]): import('@nexus/chat-core').ChatContact[];
export declare function createSendQueue(): { list: Function; enqueue: Function; remove: Function; markError: Function };
export declare function openContactThread(chat: import('@nexus/chat-core').NexusChat, contactId: string, contact?: import('@nexus/chat-core').ChatContact): Promise<{ conversationId: string | null }>;
export declare function loadConversationHistory(client: import('@nexus/chat-core').CommandClient, chat: import('@nexus/chat-core').NexusChat, conversationId: string): Promise<void>;
export declare function useChatState(chat: import('@nexus/chat-core').NexusChat): import('@nexus/chat-core').ChatState;
export declare function useChatPanel(chat: import('@nexus/chat-core').NexusChat): { state: import('@nexus/chat-core').ChatState; panel: import('@nexus/chat-core').PanelState | null };
`;

writeFileSync(join(dir, 'index.d.ts'), dts);
writeFileSync(join(dir, 'index.d.cts'), dts);
console.log('wrote dist/index.d.ts');
