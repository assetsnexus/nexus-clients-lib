export function participantResponseModeSelectValue(responseMode: unknown): 'mention_only' | 'always' | 'inherit' {
  if (responseMode === 'mention_only' || responseMode === 'always') return responseMode;
  return 'inherit';
}

/** Maps select value to backend payload: inherit → null. */
export function participantResponseModeFromSelect(value: unknown): 'mention_only' | 'always' | null {
  if (value === 'mention_only' || value === 'always') return value;
  return null;
}
