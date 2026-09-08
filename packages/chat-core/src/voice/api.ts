import type { ChatVoiceCallSession, ChatVoiceDialInInfo, ChatHooks } from '../types.js';
import type { ChatTurn, PanelState } from '../state.js';
import { BrowserCallSession } from './session.js';
import type { VoiceBridgeEventPayload, VoiceCallSurface } from './types.js';

type SendResult =
  | { ok: true; data?: unknown; kind?: string }
  | {
      ok: false;
      kind: string;
      message?: string;
      [key: string]: unknown;
    };

type CommandClient = {
  send: (
    command: string,
    payload?: Record<string, unknown>,
    opts?: { requestId?: string },
  ) => Promise<SendResult | unknown>;
};

export type VoiceApiDeps = {
  client: CommandClient;
  hooks?: ChatHooks;
  logger?: { debug?: Function; error?: Function; warn?: Function };
  getState: () => {
    calls: ChatVoiceCallSession[];
    turns: ChatTurn[];
    conversationId: string | null;
  };
  setState: (patch: Record<string, unknown>) => void;
  patchCurrentPanel: (patch: Partial<PanelState>) => void;
  syncMessagesFromTurns: (turns: ChatTurn[]) => void;
  unwrapData: (result: unknown) => Record<string, unknown>;
};

function assertOk(result: unknown, fallback: string): void {
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    const fail = result as Extract<SendResult, { ok: false }>;
    throw new Error(fail.message || fallback);
  }
}

function upsertCall(deps: VoiceApiDeps, call: ChatVoiceCallSession): ChatVoiceCallSession {
  const calls = [...deps.getState().calls.filter((row) => row.callSid !== call.callSid), call];
  deps.setState({ calls });
  deps.patchCurrentPanel({ activeCall: call });
  return call;
}

function patchCall(
  deps: VoiceApiDeps,
  callSid: string,
  patch: Partial<ChatVoiceCallSession>,
): ChatVoiceCallSession | null {
  const calls = deps
    .getState()
    .calls.map((call) => (call.callSid === callSid ? { ...call, ...patch } : call));
  deps.setState({ calls });
  const next = calls.find((call) => call.callSid === callSid) || null;
  deps.patchCurrentPanel({ activeCall: next });
  return next;
}

function dialInFromChannel(data: Record<string, unknown>): ChatVoiceDialInInfo {
  const phone = (data.phone && typeof data.phone === 'object' ? data.phone : {}) as Record<
    string,
    unknown
  >;
  return {
    phoneE164: typeof phone.phoneE164 === 'string' ? phone.phoneE164 : null,
    phoneDisplay:
      typeof phone.friendlyName === 'string'
        ? phone.friendlyName
        : typeof phone.phoneE164 === 'string'
          ? phone.phoneE164
          : null,
    accessCode: typeof data.accessCode === 'string' ? data.accessCode : null,
    channelId: typeof data.id === 'string' ? data.id : typeof data._id === 'string' ? data._id : null,
    resolvedPricing:
      data.resolvedPricing && typeof data.resolvedPricing === 'object'
        ? (data.resolvedPricing as Record<string, unknown>)
        : null,
  };
}

export function createVoiceApi(deps: VoiceApiDeps) {
  const session = new BrowserCallSession({
    logger: deps.logger,
    onSurfaceChange: (surface) => {
      deps.hooks?.onVoiceSurfaceChange?.(surface);
      if (surface.callSid) {
        patchCall(deps, surface.callSid, {
          status:
            surface.status === 'live'
              ? 'live'
              : surface.status === 'paused'
                ? 'paused'
                : surface.status === 'connecting'
                  ? 'connecting'
                  : surface.status === 'error'
                    ? 'error'
                    : surface.status === 'idle'
                      ? 'ended'
                      : 'active',
          muted: surface.muted,
          paused: surface.paused,
          elapsedSec: surface.elapsedSec,
          errorMessage: surface.errorMessage,
        });
      }
    },
    onTranscript: ({ role, text, dedupeKey }) => {
      const turns = deps.getState().turns;
      if (turns.some((t) => t.id === `voice_${dedupeKey}`)) return;
      deps.syncMessagesFromTurns([
        ...turns,
        {
          id: `voice_${dedupeKey}`,
          role,
          text,
        },
      ]);
    },
    onBridgeEvent: async (payload) => {
      const rtCallSid =
        deps
          .getState()
          .calls.find(
            (c) => c.status === 'live' || c.status === 'connecting' || c.status === 'paused',
          )?.callSid || null;
      if (!rtCallSid) return;
      try {
        await deps.client.send('anx.agents.voice-channel.event.append', {
          callSid: rtCallSid,
          event: payload.event,
          text: payload.text,
          toolName: payload.toolName,
          toolCallId: payload.toolCallId,
          toolArgs: payload.toolArgs,
          toolResult: payload.toolResult,
          state: payload.state,
        });
      } catch (err) {
        deps.logger?.warn?.('[voice] event.append failed', err);
      }
    },
    onError: (message) => {
      deps.hooks?.onError?.(new Error(message));
    },
    onCreditsExhausted: () => {
      const active =
        deps
          .getState()
          .calls.find(
            (c) => c.status === 'live' || c.status === 'connecting' || c.status === 'paused',
          ) || null;
      deps.hooks?.onCreditsExhausted?.({
        callSid: active?.callSid ?? null,
        agentId: active?.agentId ?? null,
      });
    },
  });

  async function createBrowserCall(
    agentId: string,
    conversationId?: string | null,
  ): Promise<ChatVoiceCallSession> {
    const result = (await deps.client.send('anx.agents.voice-channel.browser-call.create', {
      agentId,
      conversationId: conversationId ?? undefined,
    })) as SendResult | unknown;
    assertOk(result, 'voice-channel.browser-call.create failed');
    const data = deps.unwrapData(result);
    return upsertCall(deps, {
      agentId,
      callSid: String(data.callSid || data.id || ''),
      conversationId:
        typeof data.conversationId === 'string' ? data.conversationId : conversationId ?? null,
      mode: 'browser',
      status: 'connecting',
    });
  }

  async function createRealtimeCall(input: {
    agentId: string;
    callSid: string;
    sdp: string;
    conversationId?: string | null;
    virtualAgentId?: string | null;
    pageContext?: Record<string, unknown>;
    instructions?: string;
  }): Promise<Record<string, unknown>> {
    const result = (await deps.client.send('anx.inference.realtime.call.create', {
      agentId: input.agentId,
      callSid: input.callSid,
      sdp: input.sdp,
      conversationId: input.conversationId ?? undefined,
      virtualAgentId: input.virtualAgentId ?? undefined,
      pageContext: input.pageContext,
      instructions: input.instructions,
    })) as SendResult | unknown;
    assertOk(result, 'realtime.call.create failed');
    const data = deps.unwrapData(result);
    patchCall(deps, input.callSid, {
      status: 'live',
      answerSdp: String(data.answerSdp || data.sdp || ''),
      realtime: data,
    });
    return data;
  }

  async function getVoiceChannel(agentId: string): Promise<Record<string, unknown> | null> {
    const result = (await deps.client.send('anx.agents.voice-channel.get', { agentId })) as
      | SendResult
      | unknown;
    if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
      return null;
    }
    const data = deps.unwrapData(result);
    return Object.keys(data).length ? data : null;
  }

  async function endVoiceCall(input: { agentId: string; callSid: string }): Promise<boolean> {
    session.stop();
    const result = (await deps.client.send('anx.agents.voice-channel.active-call.end', input)) as
      | SendResult
      | unknown;
    if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
      patchCall(deps, input.callSid, { status: 'ended' });
      return false;
    }
    patchCall(deps, input.callSid, { status: 'ended' });
    return true;
  }

  return {
    session,
    getVoiceSurface(): VoiceCallSurface {
      return session.getSurface();
    },
    reattachVoice(agentId?: string | null): boolean {
      return session.reattach(agentId);
    },
    createBrowserCall,
    createRealtimeCall,
    async createLiveSttSession(input: { bookId?: string; modelId?: string } = {}) {
      const result = (await deps.client.send('anx.inference.stt.live-session.create', input)) as
        | SendResult
        | unknown;
      assertOk(result, 'stt.live-session.create failed');
      return deps.unwrapData(result) as {
        mode: string;
        modelId: string | null;
        token?: string;
        expiresAt?: string;
        endpoints?: string[];
        wsPath?: string;
        [key: string]: unknown;
      };
    },
    /**
     * Connect to the live STT WebSocket and return a session handle.
     * Prefer `session.endpoints[0]` + `session.token` from createLiveSttSession.
     */
    connectLiveSttWebSocket(params: {
      wsUrl: string;
      token: string;
      onPartial?: (text: string) => void;
      onFinal?: (text: string) => void;
      onError?: (error: string) => void;
      onClosed?: () => void;
    }): {
      send: (audioFrame: ArrayBuffer | Uint8Array) => void;
      close: () => void;
    } {
      const url = new URL(params.wsUrl);
      url.searchParams.set('token', params.token);
      const ws = new WebSocket(url.toString());
      ws.binaryType = 'arraybuffer';
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data)) as {
            type?: string;
            text?: string;
            error?: string;
          };
          if (msg.type === 'partial' && msg.text) params.onPartial?.(msg.text);
          else if (msg.type === 'final' && msg.text) params.onFinal?.(msg.text);
          else if (msg.type === 'error' && msg.error) params.onError?.(msg.error);
          else if (msg.type === 'closed') params.onClosed?.();
        } catch { /* non-JSON frame */ }
      };
      ws.onerror = () => params.onError?.('WebSocket connection error');
      ws.onclose = () => params.onClosed?.();
      return {
        send(audioFrame: ArrayBuffer | Uint8Array) {
          if (ws.readyState === WebSocket.OPEN) ws.send(audioFrame);
        },
        close() {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'close' })); } catch { /* */ }
          }
          try { ws.close(); } catch { /* */ }
        },
      };
    },
    /**
     * Full browser WebRTC path:
     * browser-call.create → getUserMedia → offer → realtime.call.create → acceptAnswer
     */
    async startBrowserCall(input: {
      agentId: string;
      conversationId?: string | null;
      virtualAgentId?: string | null;
      pageContext?: Record<string, unknown>;
      instructions?: string;
    }): Promise<ChatVoiceCallSession> {
      if (session.isConnected(input.agentId)) {
        session.reattach(input.agentId);
        const existing =
          deps.getState().calls.find((c) => c.agentId === input.agentId && c.mode === 'browser') ||
          null;
        if (existing) return existing;
      }

      const call = await createBrowserCall(input.agentId, input.conversationId);
      try {
        await session.start({
          agentId: input.agentId,
          callSid: call.callSid,
          conversationId: call.conversationId,
          negotiateAnswer: async (localSdp) => {
            const data = await createRealtimeCall({
              agentId: input.agentId,
              callSid: call.callSid,
              sdp: localSdp,
              conversationId: call.conversationId,
              virtualAgentId: input.virtualAgentId,
              pageContext: input.pageContext,
              instructions: input.instructions,
            });
            return {
              answerSdp: String(data.answerSdp || data.sdp || ''),
              postConnectSessionUpdate:
                data.postConnectSessionUpdate && typeof data.postConnectSessionUpdate === 'object'
                  ? (data.postConnectSessionUpdate as Record<string, unknown>)
                  : null,
            };
          },
        });
        return (
          patchCall(deps, call.callSid, { status: 'live' }) || {
            ...call,
            status: 'live',
          }
        );
      } catch (err) {
        patchCall(deps, call.callSid, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Browser call failed',
        });
        try {
          await endVoiceCall({ agentId: input.agentId, callSid: call.callSid });
        } catch {
          session.stop();
        }
        throw err;
      }
    },
    async createOutboundCall(input: {
      agentId: string;
      conversationId?: string | null;
      virtualAgentId?: string | null;
      continueConversation?: boolean;
    }): Promise<ChatVoiceCallSession> {
      const result = (await deps.client.send('anx.agents.voice-channel.outbound-call.create', {
        agentId: input.agentId,
        conversationId: input.conversationId ?? undefined,
        virtualAgentId: input.virtualAgentId ?? undefined,
        continueConversation: input.continueConversation ?? true,
      })) as SendResult | unknown;
      assertOk(result, 'voice-channel.outbound-call.create failed');
      const data = deps.unwrapData(result);
      return upsertCall(deps, {
        agentId: input.agentId,
        callSid: String(data.callSid || data.id || ''),
        conversationId:
          typeof data.conversationId === 'string'
            ? data.conversationId
            : input.conversationId ?? null,
        mode: 'outbound',
        status: 'ringing',
        toMasked:
          typeof data.toMasked === 'string'
            ? data.toMasked
            : typeof data.to === 'string'
              ? data.to
              : null,
      });
    },
    getVoiceChannel,
    async prepareInboundCall(agentId: string): Promise<ChatVoiceCallSession> {
      const channel = await getVoiceChannel(agentId);
      const dialIn = channel ? dialInFromChannel(channel) : null;
      return upsertCall(deps, {
        agentId,
        callSid: `inbound-wait-${agentId}`,
        conversationId: deps.getState().conversationId,
        mode: 'inbound',
        status: 'waiting_inbound',
        dialIn,
      });
    },
    async getActiveVoiceCall(
      agentId: string,
      virtualAgentId?: string | null,
    ): Promise<Record<string, unknown> | null> {
      const result = (await deps.client.send('anx.agents.voice-channel.active-call.get', {
        agentId,
        virtualAgentId: virtualAgentId ?? undefined,
      })) as SendResult | unknown;
      if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
        return null;
      }
      const data = deps.unwrapData(result);
      return Object.keys(data).length ? data : null;
    },
    async appendVoiceEvent(payload: VoiceBridgeEventPayload & { callSid: string }) {
      const result = (await deps.client.send('anx.agents.voice-channel.event.append', payload)) as
        | SendResult
        | unknown;
      assertOk(result, 'voice-channel.event.append failed');
      return deps.unwrapData(result);
    },
    async injectCallText(input: {
      agentId: string;
      callSid: string;
      text: string;
      conversationId?: string | null;
    }) {
      const result = (await deps.client.send('anx.agents.voice-channel.active-call.inject-text', {
        agentId: input.agentId,
        callSid: input.callSid,
        text: input.text,
        conversationId: input.conversationId ?? undefined,
      })) as SendResult | unknown;
      assertOk(result, 'active-call.inject-text failed');
      return deps.unwrapData(result);
    },
    endVoiceCall,
    endCall: endVoiceCall,
    toggleMute() {
      return session.toggleMute();
    },
    pauseCall() {
      session.pause();
    },
    resumeCall() {
      session.resume();
    },
    pauseOrResumeCall() {
      session.pauseOrResume();
    },
    /** Host passes region billing balance; ends call when available <= 0 (no sidecar SCA). */
    signalBillingCredits(availableCents: number | null | undefined) {
      session.signalCreditsAvailable(availableCents);
    },
  };
}

export type NexusVoiceApi = ReturnType<typeof createVoiceApi>;
