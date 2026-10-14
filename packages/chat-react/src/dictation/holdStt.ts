/**
 * Hold-to-talk on the agent rail uses the speech workload.
 * A missing grant does not start a recording and does not send a chat message.
 */

export type HoldSttModel = {
  id: string;
  modalityTransport?: string | null;
  runnable?: boolean;
};

export type HoldSttPlan =
  | { action: 'sign-in'; commands: [] }
  | { action: 'unavailable'; commands: []; reason: string }
  | { action: 'insert'; modelId: string; live: boolean; commands: string[] };

export function holdModelIsLive(model: HoldSttModel | null | undefined): boolean {
  const transport = String(model?.modalityTransport || '').toLowerCase();
  return transport === 'stt_stream' || transport === 'realtime_duplex';
}

/** Commands the rail may send. Live text skips the batch job. */
export function holdSttCommands(input: { live: boolean; hasLiveText: boolean }): string[] {
  if (input.live && input.hasLiveText) return ['anx.inference.stt.live-session.create'];
  if (input.live) return ['anx.inference.stt.live-session.create', 'anx.inference.stt.create'];
  return ['anx.inference.stt.create'];
}

export function planHoldStt(input: {
  grantMissing: boolean;
  models: HoldSttModel[] | null | undefined;
}): HoldSttPlan {
  if (input.grantMissing) return { action: 'sign-in', commands: [] };
  const models = (input.models || []).filter((model) => model.id && model.runnable !== false);
  const live = models.find((model) => holdModelIsLive(model));
  const chosen = live || models[0];
  if (!chosen) {
    return { action: 'unavailable', commands: [], reason: 'No speech model is available on this subscription.' };
  }
  const streaming = holdModelIsLive(chosen);
  return {
    action: 'insert',
    modelId: chosen.id,
    live: streaming,
    commands: holdSttCommands({ live: streaming, hasLiveText: false }),
  };
}
