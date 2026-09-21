import type { EntityRef, TinyPagePointer } from './types.js';

const SUMMARY_MAX = 240;

export function buildTinyPagePointer(input: {
  path: string;
  title?: string;
  summary?: string;
  pageId?: string;
  entityRef?: EntityRef;
}): TinyPagePointer {
  const path = String(input.path || '').trim() || '/';
  const title = String(input.title || path).trim().slice(0, 120);
  let summary = input.summary ? String(input.summary).trim() : undefined;
  if (summary && summary.length > SUMMARY_MAX) summary = `${summary.slice(0, SUMMARY_MAX)}...`;
  const pointer: TinyPagePointer = {
    path,
    title,
    understandAvailable: true,
  };
  if (input.pageId) pointer.pageId = input.pageId;
  if (summary) pointer.summary = summary;
  if (input.entityRef) pointer.entityRef = input.entityRef;
  return pointer;
}

/** System prompt segment (~200 tokens). Tagged page_context by inference. */
export function buildTinyPagePointerPrompt(pointer: TinyPagePointer): string {
  const lines = [
    '## Current page (tiny pointer)',
    `You are on "${pointer.title}" (\`${pointer.path}\`).`,
    'Data questions (what is placed, catalog, entity state) are answered with region commands, not the browser. Use search_anx_commands or assemble_tool_catalog, then call the session anx.* reads with the entity id below. Do not call anx.page.highlight or anx.page.understand to inspect data.',
    'anx.page.* is only for showing or editing the UI (highlight a control, navigate, form preview). Call anx.page.understand (wire name anx_page_understand) before guiding or editing this page. Do not guess UI sections.',
    'Portal page tools (`anx.page.*`) run automatically in the user browser after you call them — not a permission ask. Never narrate requiresClientExecution as blocked or as a failure.',
    'Live guiding to another page: use `ask_user_choice` with choices `[Open now]` and `[Just the link]` unless session auto-nav is already on; then `anx.page.navigate` with `pingAfterArrive`. After the user confirms Open now once, further navigations may auto-open.',
  ];
  if (pointer.summary) lines.push(`Summary: ${pointer.summary}`);
  if (pointer.entityRef) {
    const e = pointer.entityRef;
    const idPart = e.id ? ` id=${e.id}` : ' (unsaved)';
    const namePart = e.name ? ` name="${e.name}"` : '';
    lines.push(`Entity: type=${e.type}${idPart}${namePart}${e.saved === false ? ' saved=false' : ''}.`);
    if (e.type === 'cluster') {
      lines.push(
        'Cluster reads: anx.cluster.get, anx.cluster.infrastructure.history, anx.cluster.get-metrics.',
      );
    }
    if (e.saved === false) {
      lines.push(
        'This canvas is unsaved, so region has no id yet. Say that it is unsaved. Do not spotlight controls to answer what is on the page.',
      );
    }
  }
  lines.push('understandAvailable: true');
  return lines.join('\n');
}

export function capInstructions(text: string, max = 4000): string {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}\n…[truncated]` : s;
}
