import type {
  ChatClientToolAccess,
  ChatToolDescriptor,
  PageToolSource,
} from '@nexus/chat-core';

/** Minimal controller surface the prop reapplication needs. */
export type PageToolsPropTarget = {
  registerTool(
    descriptor: ChatToolDescriptor,
    handler: (args: unknown) => Promise<unknown> | unknown,
  ): void;
  registerClientTool?(input: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
    access?: ChatClientToolAccess;
    availability?: 'pinned' | 'discoverable';
    /** Concept slugs linked to the tool; ride in the discoverable index entry. */
    conceptSlugs?: string[];
    handler: (args: unknown) => Promise<unknown> | unknown;
  }): void;
  setPageTools?(source: PageToolSource | null): void;
};

export type StandingToolProp = {
  descriptor: ChatToolDescriptor;
  handler: (args: unknown) => Promise<unknown> | unknown;
};

/** A client tool declared by shape (lets a host mark one `discoverable`). */
export type ClientToolProp = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  access?: ChatClientToolAccess;
  availability?: 'pinned' | 'discoverable';
  /**
   * Concept slugs linked to this tool (optional). Discoverable-only: they ride
   * in the compact `clientToolIndex` entry so discovery can match the
   * conversation's pinned concepts. Forwarded to `registerClientTool`.
   */
  conceptSlugs?: string[];
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

/**
 * Push shape-declared client tools onto the controller. A `discoverable` entry
 * keeps its schema off the wire (only the index rides along) and is bound on
 * demand; `registerClientTool` is optional on the target so an older controller
 * still compiles.
 */
export function applyClientToolsProps(
  chat: PageToolsPropTarget,
  tools: ClientToolProp[] | undefined | null,
): void {
  for (const tool of tools || []) {
    if (tool?.name && typeof tool.handler === 'function') {
      chat.registerClientTool?.({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        access: tool.access,
        availability: tool.availability,
        conceptSlugs: tool.conceptSlugs,
        handler: tool.handler,
      });
    }
  }
}

export function applyPageToolsProp(
  chat: PageToolsPropTarget,
  pageTools: PageToolSource | null | undefined,
): void {
  chat.setPageTools?.(pageTools ?? null);
}
