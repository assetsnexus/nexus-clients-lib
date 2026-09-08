export function formatCallDuration(sec: number | null | undefined): string {
  const n = Math.max(0, Number(sec) || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCreditCents(cents: number | null | undefined): string {
  return `${(Number(cents || 0) / 100).toFixed(2)} cr`;
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
};
