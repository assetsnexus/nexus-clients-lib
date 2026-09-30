import { DEFAULT_FEATURES, type ChatFeatures } from '@nexus/chat-core';

/** React-only feature flags (not passed to chat-core createNexusChat). */
export type NexusChatReactFeatures = ChatFeatures & {
  /** Admin shell routes (Brain, Memory, …). Default off. */
  adminPanels?: boolean;
};

export const DEFAULT_REACT_FEATURES: NexusChatReactFeatures = {
  ...DEFAULT_FEATURES,
  adminPanels: false,
};

export function mergeReactFeatures(
  partial?: Partial<NexusChatReactFeatures>,
): NexusChatReactFeatures {
  return { ...DEFAULT_REACT_FEATURES, ...(partial || {}) };
}

/** Strip React-only keys before createNexusChat. */
export function coreFeaturesFromReact(
  features: NexusChatReactFeatures,
): ChatFeatures {
  const { adminPanels: _admin, ...core } = features;
  return core as ChatFeatures;
}
