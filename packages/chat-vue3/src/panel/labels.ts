export function formatCallDuration(sec: number | null | undefined): string {
  const n = Math.max(0, Number(sec) || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format platform credit cents as `X.XX cr` (legacy prepaid chrome).
 * Prefer {@link formatMoneyMinor} when a display currency is present.
 */
export function formatCreditCents(cents: number | null | undefined): string {
  return `${(Number(cents || 0) / 100).toFixed(2)} cr`;
}

const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

const SYMBOL_PREFIX: Record<string, string> = {
  USD: '$',
  EUR: '€',
};

function majorFromMinor(minor: number, code: string): { major: number; digits: number } {
  if (ZERO_DECIMAL.has(code)) return { major: minor, digits: 0 };
  if (THREE_DECIMAL.has(code)) return { major: minor / 1000, digits: 3 };
  return { major: minor / 100, digits: 2 };
}

function formatMajorAmount(
  major: number,
  digits: number,
  minor: number,
  symbol: string | null,
  code: string,
): string {
  const rounded = Number(major.toFixed(digits));
  if (rounded === 0 && minor > 0) {
    if (symbol) {
      if (digits === 0) return `${symbol}${major}`;
      const precise = major.toFixed(Math.min(6, Math.max(digits + 2, 4)));
      if (Number(precise) === 0) {
        return `< ${symbol}${digits === 0 ? '1' : (1 / 10 ** digits).toFixed(digits)}`;
      }
      return `${symbol}${precise.replace(/0+$/, '').replace(/\.$/, '')}`;
    }
    const precise = major.toFixed(Math.min(6, Math.max(digits + 2, 4)));
    if (Number(precise) === 0) {
      return `< ${digits === 0 ? '1' : (1 / 10 ** digits).toFixed(digits)} ${code}`;
    }
    return `${precise.replace(/0+$/, '').replace(/\.$/, '')} ${code}`;
  }
  const body = major.toFixed(digits);
  return symbol ? `${symbol}${body}` : `${body} ${code}`;
}

/**
 * Format money minor units.
 * USD/EUR use `$` / `€` prefixes; other ISO codes keep a trailing code.
 * Falls back to credit formatting when currency is missing.
 */
export function formatMoneyMinor(
  minor: number | null | undefined,
  currency?: string | null,
): string {
  const code = String(currency || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return formatCreditCents(minor);
  }
  const amount = Number(minor || 0);
  const { major, digits } = majorFromMinor(amount, code);
  const symbol = SYMBOL_PREFIX[code] || null;
  return formatMajorAmount(major, digits, amount, symbol, code);
}

/** Spend / credits chrome label: money → "Cost", else "Credits". */
export function spendLabelForCurrency(
  currency?: string | null,
  labels?: { cost?: string; credits?: string } | null,
): string {
  const code = String(currency || '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(code)
    ? labels?.cost || 'Cost'
    : labels?.credits || 'Credits';
}

export type NexusChatPanelLabels = {
  contacts?: string;
  rooms?: string;
  newRoom?: string;
  messages?: string;
  composerPlaceholder?: string;
  send?: string;
  attach?: string;
  call?: string;
  streaming?: string;
  contextCompacted?: string;
  usageEmpty?: string;
  throttled?: string;
  creditsInsufficient?: string;
  creditsInsufficientHint?: string;
  spendLimit?: string;
  spendLimitHint?: string;
  pending?: string;
  voiceSession?: string;
  endCall?: string;
  dial?: string;
  code?: string;
  uploading?: string;
  queued?: string;
  uploadFailed?: string;
  dropFiles?: string;
  removeAttachment?: string;
  cancelUpload?: string;
  retryUpload?: string;
  addMore?: string;
  destConversation?: string;
  destBucket?: string;
  destExpires?: string;
  /** Transcript / chrome */
  you?: string;
  assistant?: string;
  system?: string;
  unknown?: string;
  copy?: string;
  usage?: string;
  usageDetails?: string;
  cost?: string;
  credits?: string;
  mode?: string;
  /** Speak widget */
  speak?: string;
  speaking?: string;
  generatingVoice?: string;
  playing?: string;
  playAgain?: string;
  cancelSpeak?: string;
  voiceSettings?: string;
  replyVoice?: string;
  agentVoiceHint?: string;
  agentVoiceSettings?: string;
  model?: string;
  voicePreset?: string;
  optional?: string;
  save?: string;
  saving?: string;
  reset?: string;
  transportBatch?: string;
  transportStream?: string;
  /** Billing popover */
  billingTitle?: string;
  billingClose?: string;
  billingLoading?: string;
  billingMode?: string;
  billingTokens?: string;
  billingTracked?: string;
  billingTrackedSpend?: string;
  billingCreditsCharged?: string;
  billingByokHint?: string;
  billingRecentTurns?: string;
  billingEmptyTurns?: string;
  billingOpenDashboard?: string;
  billingModeByok?: string;
  billingModeCredits?: string;
  billingModeWaived?: string;
  billingModeFree?: string;
};

export const DEFAULT_PANEL_LABELS: Required<NexusChatPanelLabels> = {
  contacts: 'Contacts',
  rooms: 'Rooms',
  newRoom: 'New room',
  messages: 'Messages',
  composerPlaceholder: 'Type a message…',
  send: 'Send',
  attach: 'Attach',
  call: 'Call',
  streaming: 'Streaming…',
  contextCompacted: 'Context compacted',
  usageEmpty: 'No usage yet',
  throttled: 'Send temporarily limited',
  creditsInsufficient: 'Insufficient credits',
  creditsInsufficientHint: 'Top up credits on your subscription to continue.',
  spendLimit: 'Spend limit reached',
  spendLimitHint: 'Adjust limits or wait for the next budget window.',
  pending: 'pending',
  voiceSession: 'Voice session',
  endCall: 'End call',
  dial: 'Dial',
  code: 'Code',
  uploading: 'Uploading…',
  queued: 'Waiting…',
  uploadFailed: 'Upload failed',
  dropFiles: 'Drop files to attach',
  removeAttachment: 'Remove',
  cancelUpload: 'Cancel upload',
  retryUpload: 'Retry',
  addMore: 'Add file',
  destConversation: 'In conversation',
  destBucket: 'In bucket',
  destExpires: 'Expires',
  you: 'You',
  assistant: 'Assistant',
  system: 'System',
  unknown: 'Unknown',
  copy: 'Copy',
  usage: 'Usage',
  usageDetails: 'Usage details',
  cost: 'Cost',
  credits: 'Credits',
  mode: 'Mode',
  speak: 'Speak',
  speaking: 'Speaking…',
  generatingVoice: 'Generating voice…',
  playing: 'Playing…',
  playAgain: 'Play again',
  cancelSpeak: 'Cancel',
  voiceSettings: 'Voice settings',
  replyVoice: 'Reply voice',
  agentVoiceHint: 'Open agent Channels to edit the default reply voice.',
  agentVoiceSettings: 'Agent voice settings',
  model: 'Model',
  voicePreset: 'Voice preset',
  optional: 'optional',
  save: 'Save',
  saving: 'Saving…',
  reset: 'Reset',
  transportBatch: 'batch',
  transportStream: 'streaming',
  billingTitle: 'Conversation usage',
  billingClose: 'Close',
  billingLoading: 'Loading…',
  billingMode: 'Mode',
  billingTokens: 'Tokens',
  billingTracked: '{label} (tracked)',
  billingTrackedSpend: 'Tracked spend',
  billingCreditsCharged: 'Platform credits charged',
  billingByokHint:
    'BYOK / region subscription: usage is metered; platform prepaid credits are not debited.',
  billingRecentTurns: 'Recent turns',
  billingEmptyTurns: 'No billed turns recorded yet for this session.',
  billingOpenDashboard: 'Open cost dashboard',
  billingModeByok: 'BYOK / region (metered)',
  billingModeCredits: 'Platform credits',
  billingModeWaived: 'Waived',
  billingModeFree: 'Free',
};
