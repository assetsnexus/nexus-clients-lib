import type { ChatToolDescriptor, PageToolSource } from '@nexus/chat-core';

/** Minimal controller surface the prop reapplication needs. */
export type PageToolsPropTarget = {
  registerTool(
    descriptor: ChatToolDescriptor,
    handler: (args: unknown) => Promise<unknown> | unknown,
  ): void;
  setPageTools?(source: PageToolSource | null): void;
};

export type StandingToolProp = {
  descriptor: ChatToolDescriptor;
  handler: (args: unknown) => Promise<unknown> | unknown;
};

/**
 * Push the current `tools` / `pageTools` props onto a controller.
 *
 * `NexusChatApp` rebuilds its controller when `lockedAgent` or `features`
 * change; the rebuilt controller already received the props at create time, but
 * this also covers a prop change (new route, new tool list) on an existing one.
 * A route change that only swaps `pageTools` never rebuilds the controller.
 */
export function applyToolsProps(
  chat: PageToolsPropTarget,
  tools: StandingToolProp[] | undefined | null,
): void {
  for (const tool of tools || []) {
    if (tool?.descriptor?.name) chat.registerTool(tool.descriptor, tool.handler);
  }
}

export function applyPageToolsProp(
  chat: PageToolsPropTarget,
  pageTools: PageToolSource | null | undefined,
): void {
  chat.setPageTools?.(pageTools ?? null);
}
