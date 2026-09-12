/**
 * Filter the entitled chat-model catalog to STT / STT-stream rows.
 * Capability names match static-model-registry + inference `classifyAudioRow`.
 */

type CapModel = {
  id?: string;
  modelRef?: string;
  category?: string | null;
  capabilities?: unknown;
  modalityTransport?: string | null;
};

function lowerCaps(model: CapModel): string[] {
  return Array.isArray(model?.capabilities)
    ? model.capabilities.map((c) => String(c).toLowerCase())
    : [];
}

function categoryOf(model: CapModel): string {
  return String(model?.category || '').toLowerCase();
}

/** True when a picker row can run speech-to-text (batch and/or stream). */
export function modelHasSttCapability(model: CapModel | null | undefined): boolean {
  if (!model || typeof model !== 'object') return false;
  const category = categoryOf(model);
  const caps = lowerCaps(model);
  return (
    category === 'stt' ||
    category.includes('speech_to_text') ||
    caps.some(
      (cap) =>
        cap === 'stt' ||
        cap === 'stt_stream' ||
        cap === 'transcribe' ||
        cap.includes('speech_to_text') ||
        (cap.includes('stt') && !cap.includes('tts')),
    )
  );
}

/** True when live / streaming STT should be used while recording. */
export function modelSupportsSttStream(model: CapModel | null | undefined): boolean {
  if (!modelHasSttCapability(model)) return false;
  const caps = lowerCaps(model!);
  const transport = String(model?.modalityTransport || '').toLowerCase();
  return (
    caps.includes('stt_stream') ||
    transport === 'stt_stream' ||
    transport === 'realtime_duplex'
  );
}

export function filterSttModelsForPicker<T extends CapModel>(models: T[] | null | undefined): T[] {
  return (Array.isArray(models) ? models : []).filter(modelHasSttCapability);
}

export function findSttModel<T extends CapModel>(
  models: T[] | null | undefined,
  modelId: string | null | undefined,
): T | null {
  const id = String(modelId || '').trim();
  if (!id) return null;
  return (
    filterSttModelsForPicker(models).find(
      (m) => m && (m.id === id || m.modelRef === id),
    ) || null
  );
}
