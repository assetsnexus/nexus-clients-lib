export function participantResponseModeSelectValue(responseMode) {
  if (responseMode === 'mention_only' || responseMode === 'always') return responseMode
  return 'inherit'
}

/** Maps select value to backend payload: inherit → null. */
export function participantResponseModeFromSelect(value) {
  if (value === 'mention_only' || value === 'always') return value
  return null
}
