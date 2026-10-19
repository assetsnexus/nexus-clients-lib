import type { PageToolSchema, PageToolSource } from '@nexus/chat-core';
import type { HostPageScreen, HostPageSitemapEntry } from '../bridge/host-bridge.js';

/**
 * Build a `pageTools` source for a native (non-DOM) host screen.
 *
 * The app ships a sitemap (`getSitemap`) and a screen pack for the active route
 * (`getScreen`). This turns them into the same rail the portal uses:
 *
 * - generic `anx.page.search` / `anx.page.navigate` / `anx.page.understand`
 * - the screen's own `app.*` tools, delegated to `runHostTool`
 *
 * No DOM is touched, so it works in the app WebView, in a test, or in any native
 * bridge. A successful navigate is expected to make the host post a fresh
 * `pageScreen`; the next `pointer()` reads it.
 */
export type CreateHostPageToolsInput = {
  getSitemap: () => HostPageSitemapEntry[];
  getScreen: () => HostPageScreen | null;
  /** Ask the host to route (native bridge). Resolves once the request was sent. */
  navigate?: (path: string) => void | Promise<void>;
  /** Run one screen `app.*` tool. Required for those tools to be executable. */
  runHostTool?: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
};

export const HOST_GENERIC_PAGE_TOOLS: PageToolSchema[] = [
  {
    name: 'anx.page.search',
    description:
      'Search the app screens by title or summary. Returns paths and titles; call anx.page.navigate to open one.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text screen query' },
        limit: { type: 'number', description: 'Max hits (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'anx.page.navigate',
    description:
      'Open an app screen by path. Ask the user with ask_user_choice first unless they already asked to go there.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'anx.page.understand',
    description:
      'Load the instructions and available tools for the CURRENT app screen. Call before guiding or acting on it.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

export function createHostPageTools(input: CreateHostPageToolsInput): PageToolSource {
  const screenTools = () => input.getScreen()?.tools || [];
  const genericNames = new Set(HOST_GENERIC_PAGE_TOOLS.map((t) => t.name));

  return {
    schemas() {
      // Screen tools last so a screen can override a generic name.
      const byName = new Map<string, PageToolSchema>();
      for (const schema of [...HOST_GENERIC_PAGE_TOOLS, ...screenTools()]) {
        byName.set(schema.name, schema);
      }
      return [...byName.values()];
    },
    canExecute(name) {
      if (genericNames.has(name)) return true;
      return screenTools().some((t) => t.name === name) && typeof input.runHostTool === 'function';
    },
    async execute(name, args) {
      if (name === 'anx.page.search') return searchSitemap(input.getSitemap(), args);
      if (name === 'anx.page.understand') return understandScreen(input.getScreen());
      if (name === 'anx.page.navigate') {
        const path = String(args.path || '').trim();
        if (!path) return { ok: false, error: 'path is required' };
        if (!input.navigate) return { ok: false, error: 'navigation is not available in this host' };
        await input.navigate(path);
        return { ok: true, path, navigated: true };
      }
      if (!input.runHostTool) return { ok: false, error: `Unknown page tool: ${name}` };
      return input.runHostTool(name, args || {});
    },
    pointer() {
      const screen = input.getScreen();
      if (!screen?.path) return null;
      return {
        path: screen.path,
        prompt: screen.instructions
          ? `Current app screen: ${screen.title} (${screen.path}). ${screen.instructions}`
          : `Current app screen: ${screen.title} (${screen.path}).`,
      };
    },
  };
}

function searchSitemap(
  pages: HostPageSitemapEntry[],
  args: Record<string, unknown>,
): { ok: boolean; hits: HostPageSitemapEntry[] } {
  const query = String(args.query || '').trim().toLowerCase();
  const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 10;
  if (!query) return { ok: false, hits: [] };
  const scored = pages
    .map((page) => ({ page, score: scorePage(page, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.page);
  return { ok: true, hits: scored };
}

function scorePage(page: HostPageSitemapEntry, query: string): number {
  const title = (page.title || '').toLowerCase();
  const path = (page.path || '').toLowerCase();
  const summary = (page.summary || '').toLowerCase();
  let score = 0;
  if (title === query || path === query) score += 100;
  if (title.includes(query)) score += 40;
  if (path.includes(query)) score += 25;
  if (summary.includes(query)) score += 10;
  return score;
}

function understandScreen(screen: HostPageScreen | null): {
  ok: boolean;
  instructions?: string;
  extraFunctionSchemas?: PageToolSchema[];
  commands: unknown[];
} {
  if (!screen) {
    return { ok: true, instructions: 'No app screen is registered.', commands: [] };
  }
  return {
    ok: true,
    instructions:
      screen.instructions ||
      `App screen ${screen.title} (${screen.path}). No per-screen instructions registered.`,
    extraFunctionSchemas: screen.tools || [],
    commands: [],
  };
}
