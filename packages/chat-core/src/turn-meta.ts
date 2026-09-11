import type { ChatTurn } from './state.js';

export type TurnSenderLineOpts = {
  /** Authenticated viewer user id (maps to youLabel). */
  viewerUserId?: string | null;
  /** Fallback name for the counterpart (1:1 agent/user). */
  contactName?: string | null;
  /** Room participant id → display name. */
  participantNames?: Record<string, string> | null;
  /** Clock used for "today" checks (tests). */
  now?: Date;
  /** Localized role / viewer labels. */
  youLabel?: string | null;
  assistantLabel?: string | null;
  systemLabel?: string | null;
  unknownLabel?: string | null;
  /** Optional localized short month names (index 0 = January). */
  monthNames?: string[] | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const DEFAULT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Compact local time: `HH:mm`, or `D MMM HH:mm` when not today. */
export function formatTurnTime(
  createdAt: string | number | Date | null | undefined,
  now: Date = new Date(),
  monthNames?: string[] | null,
): string {
  if (createdAt == null || createdAt === '') return '';
  const d =
    createdAt instanceof Date
      ? createdAt
      : typeof createdAt === 'number'
        ? new Date(createdAt)
        : new Date(String(createdAt));
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;
  const months =
    Array.isArray(monthNames) && monthNames.length >= 12 ? monthNames : DEFAULT_MONTHS;
  return `${d.getDate()} ${months[d.getMonth()]} ${time}`;
}

function resolveSenderName(
  turn: Pick<ChatTurn, 'role' | 'senderId' | 'senderName'>,
  opts: TurnSenderLineOpts,
): string {
  const you = (opts.youLabel && String(opts.youLabel).trim()) || 'You';
  const assistant = (opts.assistantLabel && String(opts.assistantLabel).trim()) || 'Assistant';
  const system = (opts.systemLabel && String(opts.systemLabel).trim()) || 'System';
  const unknown = (opts.unknownLabel && String(opts.unknownLabel).trim()) || 'Unknown';
  const viewer = opts.viewerUserId ? String(opts.viewerUserId) : '';
  const senderId = turn.senderId ? String(turn.senderId) : '';
  if (viewer && senderId && senderId === viewer) return you;
  if (turn.role === 'user' && (!senderId || (viewer && senderId === viewer))) return you;
  if (turn.senderName && String(turn.senderName).trim()) return String(turn.senderName).trim();
  if (senderId && opts.participantNames?.[senderId]) {
    return String(opts.participantNames[senderId]).trim();
  }
  if (turn.role === 'assistant' || turn.role === 'system') {
    const contact = opts.contactName ? String(opts.contactName).trim() : '';
    if (contact) return contact;
    return turn.role === 'system' ? system : assistant;
  }
  if (turn.role === 'user') return you;
  return unknown;
}

/**
 * Compact selectable meta line: `You · 16:42` / `Alex · 16:42`.
 * Real text (not CSS ::before) so mouse selection copies names + timestamps.
 */
export function formatTurnSenderLine(
  turn: Pick<ChatTurn, 'role' | 'senderId' | 'senderName' | 'createdAt'>,
  opts: TurnSenderLineOpts = {},
): string {
  const name = resolveSenderName(turn, opts);
  const time = formatTurnTime(turn.createdAt, opts.now, opts.monthNames);
  if (name && time) return `${name} · ${time}`;
  if (name) return name;
  return time;
}
