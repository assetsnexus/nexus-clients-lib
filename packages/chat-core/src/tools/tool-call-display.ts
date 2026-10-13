import { parsePresentFileItems, type PresentFileItem } from './present-file.js';

export type ToolCallNameParts = {
  /** Tool name, e.g. `list_projects`. */
  name: string;
  /** MCP server id when the raw name is `mcp__<server>__<tool>`. */
  server: string | null;
};

export type ToolRunRowModel = {
  name: string;
  server: string | null;
  status: string;
  files: PresentFileItem[];
  resultText: string | null;
};

const RESULT_TEXT_MAX = 12_000;

/**
 * `mcp__catalog__list_projects` → name `list_projects`, server `catalog`.
 * Other tool names stay as given. Does not invent a description.
 */
export function displayToolCallName(raw: string | null | undefined): ToolCallNameParts {
  const tool = String(raw || '').trim();
  if (!tool) return { name: 'tool', server: null };
  if (!tool.startsWith('mcp__')) return { name: tool, server: null };
  const parts = tool.split('__');
  const server = parts[1]?.trim() || '';
  const name = parts.slice(2).join('__').trim();
  if (parts[0] !== 'mcp' || !server || !name) return { name: tool, server: null };
  return { name, server };
}

function clipResultText(text: string): string {
  if (text.length <= RESULT_TEXT_MAX) return text;
  return `${text.slice(0, RESULT_TEXT_MAX)}\n…`;
}

/** Pretty-print a tool result for the row. Null only when there is no result. */
export function formatToolResultText(result: unknown): string | null {
  if (result == null) return null;
  if (typeof result === 'string') {
    const text = result.trim();
    if (!text) return null;
    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      try {
        return clipResultText(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        return clipResultText(text);
      }
    }
    return clipResultText(text);
  }
  if (typeof result === 'number' || typeof result === 'boolean') return String(result);
  try {
    return clipResultText(JSON.stringify(result, null, 2));
  } catch {
    return null;
  }
}

/**
 * What a generic tool row should show. File chips only when the result is a
 * real stored file. Otherwise the result text stays visible.
 */
export function presentToolRunRow(run: {
  tool?: string | null;
  label?: string | null;
  status?: string | null;
  result?: unknown;
}): ToolRunRowModel {
  const named = displayToolCallName(run.tool || run.label);
  const files = parsePresentFileItems(run.result);
  return {
    name: named.name,
    server: named.server,
    status: run.status || 'running',
    files,
    resultText: files.length > 0 ? null : formatToolResultText(run.result),
  };
}
