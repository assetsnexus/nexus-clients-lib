/**
 * Dictation copy for the portal (Vue 2) overlay.
 *
 * The wording and the failure-code mapping live in `@nexus/chat-core`
 * (`dictation-outcome.ts`) so the React composer, the desktop host and this
 * overlay never drift. This module only bridges that shared policy to the
 * overlay's label overrides: a host may pass localized labels, but the default
 * is always the shared, actionable copy — never the raw server string.
 */
import {
  dictationFailureMessage,
  micFailureCode,
  transcriptionFailureCode,
  transcriptionFailureMessage,
  type DictationFailureCode,
} from '@nexus/chat-core'

type LabelBag = Record<string, string | undefined>

/** Label key that overrides the shared copy for each batch-transcriber failure. */
const LABEL_BY_CODE: Partial<Record<DictationFailureCode, string>> = {
  network: 'sttNetwork',
  'transcription-failed': 'sttFailed',
}

/** Label key that overrides the shared copy for each microphone failure. */
const MIC_LABEL_BY_CODE: Partial<Record<DictationFailureCode, string>> = {
  'mic-denied': 'micDenied',
  'mic-missing': 'micNotFound',
  'mic-unavailable': 'micUnavailable',
}

/**
 * Copy for a batch-transcriber rejection. Keeps the raw server detail out of the
 * UI (the caller logs it) and falls back to the shared actionable copy when the
 * host passed no label for the resolved failure code.
 */
export function sttFailureMessage(error: unknown, labels: LabelBag = {}): string {
  const code = transcriptionFailureCode(error)
  const override = labels[LABEL_BY_CODE[code] || '']
  return override || transcriptionFailureMessage(error) || dictationFailureMessage(code)
}

/** Copy for a `getUserMedia` rejection, honouring host label overrides. */
export function micFailureMessageFor(error: unknown, labels: LabelBag = {}): string {
  const code = micFailureCode(error)
  const override = labels[MIC_LABEL_BY_CODE[code] || '']
  return override || dictationFailureMessage(code)
}

/** Shared copy for a known failure code (used for the too-short / no-model rails). */
export function dictationCopy(code: DictationFailureCode, labels: LabelBag = {}): string {
  const override = labels[LABEL_BY_CODE[code] || '']
  return override || dictationFailureMessage(code)
}

export { transcriptionFailureCode, micFailureCode }
export type { DictationFailureCode }
