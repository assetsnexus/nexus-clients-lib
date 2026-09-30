import type { ChatToolRun } from '@nexus/chat-core';
import { asRecord, displayAnxCommandName, truncateLabel } from './shared';

export type ToolRunDisplay = {
  /** Primary chip text. */
  title: string;
  /** Optional secondary line (command one-liner / metafield title). */
  subtitle: string | null;
  /** Full tooltip (lists +/− names, search query, etc.). */
  tooltip: string;
};

function resultRecord(run: ChatToolRun): Record<string, unknown> | null {
  return asRecord(run.result);
}

function stringField(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function nameList(items: unknown, limit = 12): string[] {
  if (!Array.isArray(items)) return [];
  const names: string[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item.trim());
      continue;
    }
    const r = asRecord(item);
    const n =
      stringField(r, 'name', 'command', 'id') ||
      (r && typeof r.provider === 'string' ? String(r.provider) : null);
    if (n) names.push(n);
    if (names.length >= limit) break;
  }
  return names;
}

/** Short title from command metafields / discover oneLiners when present on args or result. */
export function commandMetafieldTitle(run: ChatToolRun): string | null {
  const args = asRecord(run.args);
  const result = resultRecord(run);
  return (
    stringField(args, 'title', 'shortTitle', 'oneLiner', 'label') ||
    stringField(result, 'title', 'shortTitle', 'oneLiner', 'commandTitle', 'description') ||
    stringField(asRecord(result?.meta), 'title', 'shortTitle', 'oneLiner') ||
    stringField(asRecord(result?.command), 'title', 'shortTitle', 'oneLiner', 'description')
  );
}

function searchAnxCommandsDisplay(run: ChatToolRun): ToolRunDisplay {
  const args = asRecord(run.args);
  const result = resultRecord(run);
  const query = stringField(args, 'query') || '';
  const count =
    typeof result?.count === 'number'
      ? result.count
      : Array.isArray(result?.commands)
        ? result.commands.length
        : null;
  const totalMatch =
    typeof result?.totalMatch === 'number'
      ? result.totalMatch
      : count;
  let title = 'search commands';
  if (run.status === 'running') {
    title = query ? `search · ${truncateLabel(query, 28)}` : 'search commands';
  } else if (run.status === 'error' || run.status === 'reverted') {
    title = 'search commands';
  } else if (count != null && totalMatch != null) {
    title = `search · ${count} / ${totalMatch}`;
  } else if (count != null) {
    title = `search · ${count}`;
  }
  const cmdNames = nameList(result?.commands, 8);
  const tooltipParts = [
    query ? `query: ${query}` : null,
    count != null ? `returned ${count}` : null,
    totalMatch != null && totalMatch !== count ? `total match ${totalMatch}` : null,
    cmdNames.length ? cmdNames.join(', ') : null,
  ].filter(Boolean);
  return {
    title,
    subtitle: null,
    tooltip: tooltipParts.join(' · ') || 'search_anx_commands',
  };
}

function assembleToolCatalogDisplay(run: ChatToolRun): ToolRunDisplay {
  const result = resultRecord(run);
  const added = nameList(result?.added, 40);
  const removed = nameList(result?.removed, 40);
  const plus = added.length || (typeof result?.addedCount === 'number' ? result.addedCount : 0);
  const minus =
    removed.length || (typeof result?.removedCount === 'number' ? result.removedCount : 0);
  const running = run.status === 'running';
  let title = 'tool catalog';
  if (running) {
    title = 'assembling tools';
  } else if (run.status === 'error' || run.status === 'reverted') {
    title = 'tool catalog';
  } else if (plus || minus) {
    title = `tools +${plus}${minus ? ` −${minus}` : ''}`;
  } else {
    title = 'tools +0';
  }
  const tipLines: string[] = [];
  if (added.length) tipLines.push(`+ ${added.join(', ')}`);
  if (removed.length) tipLines.push(`− ${removed.join(', ')}`);
  const task = stringField(asRecord(run.args), 'task');
  if (task) tipLines.unshift(task);
  return {
    title,
    subtitle: null,
    tooltip: tipLines.join('\n') || 'assemble_tool_catalog',
  };
}

function anxCommandDisplay(run: ChatToolRun): ToolRunDisplay {
  const command = displayAnxCommandName(run);
  const title =
    command && command !== 'anx_command' && command !== 'anx.command'
      ? command
      : 'anx_command';
  const subtitle = commandMetafieldTitle(run);
  return {
    title,
    subtitle: subtitle && subtitle !== title ? truncateLabel(subtitle, 72) : null,
    tooltip: subtitle && subtitle !== title ? `${title}\n${subtitle}` : title,
  };
}

/**
 * Human-readable chip title for catalog / region bridge tools.
 * Falls back to the existing label / tool name for everything else.
 */
export function formatToolRunDisplay(run: ChatToolRun): ToolRunDisplay {
  const tool = String(run.tool || '').trim();
  const canonical =
    tool === 'anx_command' || tool === 'anx.command' || tool.startsWith('anx.')
      ? 'anx_command'
      : tool;

  if (canonical === 'search_anx_commands') return searchAnxCommandsDisplay(run);
  if (canonical === 'assemble_tool_catalog') return assembleToolCatalogDisplay(run);
  if (canonical === 'anx_command' || displayAnxCommandName(run).startsWith('anx.')) {
    // Direct assembled anx.* tools also land here (tool name is the command).
    if (tool.startsWith('anx.') && tool !== 'anx_command') {
      const subtitle = commandMetafieldTitle(run);
      return {
        title: tool,
        subtitle: subtitle && subtitle !== tool ? truncateLabel(subtitle, 72) : null,
        tooltip: subtitle && subtitle !== tool ? `${tool}\n${subtitle}` : tool,
      };
    }
    return anxCommandDisplay(run);
  }

  const fallback = truncateLabel(run.label || run.tool || 'tool', 64);
  return { title: fallback, subtitle: null, tooltip: run.tool || run.label || fallback };
}
