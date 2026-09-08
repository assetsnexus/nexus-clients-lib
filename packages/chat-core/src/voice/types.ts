export type BrowserRealtimeCallStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'paused'
  | 'error';

/** Module-level WebRTC state that survives Vue/React remounts. */
export type BrowserRealtimeCallRuntime = {
  agentId: string;
  callSid: string;
  conversationId: string | null;
  status: BrowserRealtimeCallStatus;
  elapsedSec: number;
  muted: boolean;
  paused: boolean;
  pc: any;
  dc: any;
  audioEl: any | null;
  localStream: any;
  localTrack: any | null;
  timerInterval: ReturnType<typeof setInterval> | null;
  connectTimeout: ReturnType<typeof setTimeout> | null;
  liveStartedAtMs: number | null;
};

export type VoiceCallSurface = {
  status: BrowserRealtimeCallStatus;
  elapsedSec: number;
  muted: boolean;
  paused: boolean;
  errorMessage: string | null;
  agentId: string | null;
  callSid: string | null;
  mode: 'browser' | 'inbound' | 'outbound' | null;
};

export type VoiceBridgeEvent =
  | 'user_utterance'
  | 'assistant_utterance'
  | 'tool_call'
  | 'tool_result'
  | 'call_state'
  | 'stream_error';

export type VoiceBridgeEventPayload = {
  event: VoiceBridgeEvent;
  text?: string;
  utteranceId?: string;
  toolName?: string;
  toolCallId?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  state?: string;
  usageInputTokens?: number;
  usageOutputTokens?: number;
  usageCachedTokens?: number;
};

export type BrowserCallRuntimeOptions = {
  createPeerConnection?: (config?: Record<string, unknown>) => any;
  getUserMedia?: (constraints: Record<string, unknown>) => Promise<any>;
  rtcConfig?: Record<string, unknown>;
  createAudioElement?: () => any;
  documentBody?: { appendChild: (el: any) => void };
};

export const CONNECT_TIMEOUT_MS = 45_000;
export const ICE_GATHER_TIMEOUT_MS = 5_000;
export const CREDITS_POLL_DEFAULT_MS = 20_000;
