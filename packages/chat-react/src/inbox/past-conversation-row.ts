import type { ConversationRow } from '@nexus/chat-core';
import { resolveConversationLabel } from '@nexus/chat-core';

export type PastConversationView = {
  id: string;
  title: string;
  summary: string;
  timeIso: string | null;
  timeLabel: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function plainLine(value: string): string {
  return value.replace(/^#{1,6}\s+/, '').replace(/^\*\*|\*\*$/g, '').trim();
}

function rowId(row: ConversationRow): string {
  return text(row.conversationId) || text(row.id) || text(row._id);
}

function activityIso(row: ConversationRow): string | null {
  for (const value of [row.lastMessageAt, row.updatedAt, row.createdAt]) {
    const iso = text(value);
    if (!iso) continue;
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

/**
 * Conversation title, reusing the shared label precedence so a raw id is never
 * shown. An agent name is not a title: prefer the region's `displayTitle` or the
 * stored `title`, and hand any remaining name/last-message fallback to
 * `pastConversationViews` as a summary rather than a title.
 */
export function pastConversationDisplayTitle(row: ConversationRow): string {
  return text(row.displayTitle) || text(row.title);
}

/** Stored title only. Kept for callers that need the raw named-thread label. */
export function pastConversationTitle(row: ConversationRow): string {
  return text(row.title);
}

export function pastConversationSummary(row: ConversationRow, title: string): string {
  const summary = plainLine(text(row.oneLineSummary) || text(row.lastMessagePreview));
  if (!summary || summary === title) return '';
  return summary;
}

export function formatPastConversationTime(iso: string, now = new Date(), locale = 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((start(now) - start(date)) / 86_400_000);
  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  if (diffDays === 1) {
    const label = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

export function pastConversationViews(
  rows: ConversationRow[],
  now = new Date(),
  locale = 'en',
): PastConversationView[] {
  const views: PastConversationView[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = rowId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // Shared precedence: displayTitle → stored title → agent name → neutral
    // literal. Never the raw conversation id. A labeled row also shows the last
    // message as its subtitle, so the label stays a name rather than a preview.
    const label = resolveConversationLabel(row as Record<string, unknown>);
    const named = Boolean(text(row.displayTitle) || text(row.title));
    const timeIso = activityIso(row);
    views.push({
      id,
      title: label,
      summary: named ? pastConversationSummary(row, label) : '',
      timeIso,
      timeLabel: timeIso ? formatPastConversationTime(timeIso, now, locale) : '',
    });
  }
  views.sort((a, b) => {
    if (a.timeIso && b.timeIso) return b.timeIso.localeCompare(a.timeIso);
    if (a.timeIso) return -1;
    if (b.timeIso) return 1;
    return 0;
  });
  return views;
}
