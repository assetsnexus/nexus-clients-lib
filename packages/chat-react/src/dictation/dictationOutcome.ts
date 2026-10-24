/**
 * Dictation outcome policy — re-exported from `@nexus/chat-core`.
 *
 * The copy and failure-code mapping live in the framework-free core package so
 * the React composer, the Vue 2 portal overlay and the desktop host all share
 * one source of truth. This module stays as the adapter-local import path the
 * composer and capture helpers already use, so a host never has to know where
 * the policy lives.
 */
export {
  MIN_CAPTURE_MS,
  DictationFailure,
  decideDictationCapture,
  dictationFailureMessage,
  micFailureCode,
  micFailureMessage,
  recognitionFailureCode,
  transcriptionFailureCode,
  transcriptionFailureMessage,
} from '@nexus/chat-core';
export type {
  DictationCaptureDecision,
  DictationCaptureInput,
  DictationFailureCode,
  DictationRail,
} from '@nexus/chat-core';
