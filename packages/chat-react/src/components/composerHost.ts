import type { PointerEvent } from 'react';
import type { ChatContact, ChatVoiceCallSession, IoDescriptor } from '@nexus/chat-core';

/** Generic call modes. Browser is WebRTC; phone rings the user; dial-in shows a number. */
export type ComposerCallMode = 'browser' | 'phone' | 'dial-in';

export type ComposerDictationPhase = 'idle' | 'recording' | 'cancel' | 'working';

export type ComposerControls = {
  attachments: {
    pending: { name: string }[];
    pick: () => void;
    remove: (index: number) => void;
  };
  dictation: {
    phase: ComposerDictationPhase;
    note: string | null;
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: () => void;
  };
  call: {
    supported: boolean;
    active: boolean;
    status: string | null;
    toMasked: string | null;
    dialIn: { phone: string | null; accessCode: string | null } | null;
    start: (mode: ComposerCallMode) => Promise<void>;
    end: () => Promise<void>;
  };
  error: string | null;
};

const INACTIVE_CALL_STATUS = new Set(['ended', 'idle', 'error', 'failed']);

export function attachmentDisplayName(file: IoDescriptor, index: number): string {
  const named = 'filename' in file && typeof file.filename === 'string' ? file.filename.trim() : '';
  return named || `Attachment ${index + 1}`;
}

export function resolveComposerCallTarget(
  contacts: readonly Pick<ChatContact, 'id' | 'type' | 'agentId' | 'virtualEmployeeId'>[],
  contactId: string | null | undefined,
): { agentId: string; virtualEmployeeId: string | null } | null {
  const id = contactId?.trim();
  if (!id) return null;
  const contact = contacts.find((row) => row.id === id);
  if (!contact || (contact.type !== 'agent' && contact.type !== 'asset_agent')) return null;
  const agentId = (contact.agentId || contact.id).trim();
  if (!agentId) return null;
  return { agentId, virtualEmployeeId: contact.virtualEmployeeId?.trim() || null };
}

export function activeComposerCall(calls: readonly ChatVoiceCallSession[]): ChatVoiceCallSession | null {
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const row = calls[i];
    if (!row?.callSid) continue;
    if (row.status && INACTIVE_CALL_STATUS.has(row.status)) continue;
    return row;
  }
  return null;
}

/** Failure text on the newest call after it leaves the live set. */
export function settledComposerCallError(calls: readonly ChatVoiceCallSession[]): string | null {
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const row = calls[i];
    if (!row?.callSid) continue;
    return row.errorMessage?.trim() || null;
  }
  return null;
}

export function composerCallSnapshot(
  calls: readonly ChatVoiceCallSession[],
  surface?: {
    status?: string | null;
    agentId?: string | null;
    callSid?: string | null;
    errorMessage?: string | null;
  } | null,
): {
  active: boolean;
  status: string | null;
  agentId: string | null;
  callSid: string | null;
  toMasked: string | null;
  dialIn: { phone: string | null; accessCode: string | null } | null;
  error: string | null;
} {
  const session = activeComposerCall(calls);
  const surfaceLive = Boolean(
    surface?.callSid && surface.status && !INACTIVE_CALL_STATUS.has(surface.status),
  );
  const dial = session?.dialIn;
  const phone = dial?.phoneDisplay?.trim() || dial?.phoneE164?.trim() || null;
  const accessCode = dial?.accessCode?.trim() || null;
  return {
    active: Boolean(session) || surfaceLive,
    status: session?.status || (surfaceLive ? surface?.status || null : null),
    agentId: session?.agentId || surface?.agentId || null,
    callSid: session?.callSid || (surfaceLive ? surface?.callSid || null : null),
    toMasked: session?.toMasked?.trim() || null,
    dialIn: phone || accessCode ? { phone, accessCode } : null,
    error: session
      ? session.errorMessage?.trim() || surface?.errorMessage?.trim() || null
      : surface?.errorMessage?.trim() || settledComposerCallError(calls),
  };
}
