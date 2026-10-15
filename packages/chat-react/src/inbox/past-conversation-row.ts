import type { ConversationRow } from '@nexus/chat-core';

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

/** Conversation title only. An agent name is not a title. */
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
    const title = pastConversationTitle(row);
    const timeIso = activityIso(row);
    views.push({
      id,
      title: title || pastConversationSummary(row, '') || 'Conversation',
      summary: title ? pastConversationSummary(row, title) : '',
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
