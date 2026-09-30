export type VoiceLayoutMode = 'avatar' | 'transcript' | 'split';

export type VoiceModeState = {
  layout: VoiceLayoutMode;
  splitRatio: number;
  active: boolean;
};

const DEFAULT_VOICE_MODE: VoiceModeState = {
  layout: 'avatar',
  splitRatio: 0.5,
  active: false,
};

type VoiceModeListener = (state: VoiceModeState) => void;

export function createVoiceModeState(initial?: Partial<VoiceModeState>): {
  get: () => VoiceModeState;
  set: (patch: Partial<VoiceModeState>) => void;
  subscribe: (listener: VoiceModeListener) => () => void;
} {
  let state: VoiceModeState = { ...DEFAULT_VOICE_MODE, ...initial };
  const listeners = new Set<VoiceModeListener>();

  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      listeners.forEach((l) => l(state));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
