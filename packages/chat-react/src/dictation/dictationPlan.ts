import { filterSttModelsForPicker, modelHasSttCapability } from '@nexus/chat-core';

export type DictationMethod = 'phone' | 'model' | 'direct';

export type DictationPrefs = {
  method: DictationMethod;
  sttModelId: string | null;
};

export const DICTATION_PREFS_KEY = 'anx.chat.dictation';
export const LIST_COLLAPSED_KEY = 'anx.chat.listCollapsed';

export type DictationModel = {
  id?: string;
  modelRef?: string;
  label?: string;
  displayName?: string;
  externalModelId?: string;
  capabilities?: unknown;
  category?: string | null;
  modalityTransport?: string | null;
};

const AUDIO_INPUT_CAPS = new Set([
  'audio_input',
  'input_audio',
  'audio',
  'multimodal_audio',
  'realtime_duplex',
]);

function lowerCaps(model: DictationModel | null | undefined): string[] {
  return Array.isArray(model?.capabilities)
    ? model.capabilities.map((cap) => String(cap).toLowerCase())
    : [];
}

function modelHaystack(model: DictationModel): string {
  return [model.id, model.modelRef, model.label, model.displayName, model.externalModelId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Active chat model can take the recording as the message instead of a transcript. */
export function modelAcceptsDirectAudio(model: DictationModel | null | undefined): boolean {
  if (!model) return false;
  const caps = lowerCaps(model);
  if (caps.some((cap) => AUDIO_INPUT_CAPS.has(cap) || cap.includes('audio_input'))) return true;
  const transport = String(model.modalityTransport || '').toLowerCase();
  return transport === 'realtime_duplex';
}

export function pickWhisperModel<T extends DictationModel>(models: T[] | null | undefined): T | null {
  const stt = filterSttModelsForPicker(models || []);
  const whisper = stt.find((model) => modelHaystack(model).includes('whisper'));
  return whisper || stt[0] || null;
}

export function resolveDictationSelection<T extends DictationModel>(input: {
  prefs: DictationPrefs | null;
  phoneAvailable: boolean;
  models: T[] | null | undefined;
  directSupported: boolean;
}): {
  method: DictationMethod;
  sttModel: T | null;
  note: string | null;
} {
  const models = input.models || [];
  const sttModels = filterSttModelsForPicker(models);
  const preferredId = input.prefs?.sttModelId || '';
  const chosen =
    sttModels.find((model) => model.id === preferredId || model.modelRef === preferredId) ||
    pickWhisperModel(sttModels);
  const requested = input.prefs?.method || 'phone';

  if (requested === 'direct') {
    if (input.directSupported) return { method: 'direct', sttModel: chosen, note: null };
    if (input.phoneAvailable) {
      return {
        method: 'phone',
        sttModel: chosen,
        note: 'This model does not take audio. Using the phone microphone.',
      };
    }
  }

  if (requested === 'model') {
    if (chosen && modelHasSttCapability(chosen)) {
      return { method: 'model', sttModel: chosen, note: null };
    }
    return {
      method: 'phone',
      sttModel: null,
      note: input.phoneAvailable
        ? 'No speech model is on this subscription. Using the phone microphone.'
        : 'No speech model is on this subscription.',
    };
  }

  if (input.phoneAvailable) return { method: 'phone', sttModel: chosen, note: null };
  if (chosen) {
    const whisper = modelHaystack(chosen).includes('whisper');
    return {
      method: 'model',
      sttModel: chosen,
      note: whisper
        ? 'Phone speech recognition is unavailable. Using Whisper.'
        : 'Phone speech recognition is unavailable. Using a speech model from your subscription.',
    };
  }
  return {
    method: 'phone',
    sttModel: null,
    note: 'Phone speech recognition is unavailable, and this subscription has no speech model.',
  };
}

export type ListCollapseStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function readStoredListCollapsed(storage: ListCollapseStorage): boolean | null {
  try {
    const raw = storage.getItem(LIST_COLLAPSED_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* private mode */
  }
  return null;
}

export function writeStoredListCollapsed(storage: ListCollapseStorage, collapsed: boolean): void {
  try {
    storage.setItem(LIST_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* private mode */
  }
}

/** Automatic collapse only when the user has not chosen and a thread is open on a narrow overlay. */
export function autoCollapseList(input: {
  stored: boolean | null;
  narrow: boolean;
  threadOpen: boolean;
}): boolean | null {
  if (input.stored != null) return null;
  if (input.narrow && input.threadOpen) return true;
  return null;
}

/** Slide off the hold target cancels; a release that stays on it commits. */
export function holdReleaseAction(input: { leftTarget: boolean }): 'commit' | 'cancel' {
  return input.leftTarget ? 'cancel' : 'commit';
}

export function pointerLeftTarget(
  rect: { left: number; top: number; right: number; bottom: number },
  x: number,
  y: number,
): boolean {
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}

export function loadDictationPrefs(storage: ListCollapseStorage): DictationPrefs | null {
  try {
    const raw = storage.getItem(DICTATION_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { method?: unknown; sttModelId?: unknown };
    const method = parsed.method;
    if (method !== 'phone' && method !== 'model' && method !== 'direct') return null;
    return {
      method,
      sttModelId: typeof parsed.sttModelId === 'string' && parsed.sttModelId ? parsed.sttModelId : null,
    };
  } catch {
    return null;
  }
}

export function saveDictationPrefs(storage: ListCollapseStorage, prefs: DictationPrefs): void {
  try {
    storage.setItem(DICTATION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

/** The composer never shows the model picker; it lives in the config sheet. */
export function composerModelPickerVisible(): boolean {
  return false;
}
