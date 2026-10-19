/**
 * Plan Part C5 / C8 / C9 — chat-chrome card helpers.
 *
 * The implementation lives in `@nexus/chat-core` (`chat-chrome-cards.ts`) so the
 * React adapter, the Vue2 portal adapter and the app all derive identical
 * shapes. This module re-exports it for the `chrome/` import convention.
 */

export {
  buildPermissionSummary,
  permissionSummaryIsEmpty,
  maskAudience,
  summarizeArgs,
  explainLastAction,
  explainInputFromRun,
  explainHasReason,
  buildWorkingOnSummary,
  workingOnRunsFromTurns,
} from '@nexus/chat-core';
export type {
  PermissionSummaryInput,
  PermissionSummary,
  PermissionSummarySection,
  ExplainActionInput,
  ExplainAction,
  ExplainableToolRun,
  WorkingOnItem,
  WorkingOnSummary,
  WorkingOnRunInput,
  WorkingOnLedgerInput,
} from '@nexus/chat-core';
