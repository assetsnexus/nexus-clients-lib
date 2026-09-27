/** AgentRun / subagent control types (portal + shared UI). */

import type { SubAgentPendingApproval } from '../state.js';

export type AgentRunOrigin =
  | 'chat_agent'
  | 'agent_task'
  | 'schedule'
  | 'definition'
  | 'media'
  | string;

export type AgentRunStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'canceled'
  | string;

/** How a parent message is delivered into a live AgentRun. */
export type MessageDelivery = 'queue' | 'interrupt' | 'steer';

export type AgentRunPlanStep = {
  id?: string;
  title: string;
  status?: string;
  detail?: string | null;
};

export type AgentRunPlan = {
  title?: string | null;
  summary?: string | null;
  steps?: AgentRunPlanStep[];
  updatedAt?: string | null;
};

export type AgentRunTaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled' | string;

export type AgentRunTask = {
  id: string;
  title: string;
  status: AgentRunTaskStatus;
  deliverables?: unknown[];
  detail?: string | null;
};

export type AgentRunSummary = {
  runId: string;
  workloadId?: string | null;
  origin?: AgentRunOrigin | null;
  status: AgentRunStatus;
  mission?: string | null;
  parentConversationId?: string | null;
  linkedConversationId?: string | null;
  costLimitMinor?: number | null;
  costUsedMinor?: number | null;
  plan?: AgentRunPlan | null;
  tasks?: AgentRunTask[];
  toolCallsSummary?: unknown;
  /** Spawning `run_sub_agent` call id (chat-spawned runs, while live). */
  parentCallId?: string | null;
  /** Client-safe pause reason when `status === 'awaiting_approval'`. */
  pendingApproval?: SubAgentPendingApproval | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SubAgentStripItem = {
  id: string;
  runId: string | null;
  parentCallId: string;
  mission: string;
  status: string;
  finalStatus?: string | null;
  linkedConversationId?: string | null;
  startedAtMs?: number | null;
  plan?: AgentRunPlan | null;
  tasks?: AgentRunTask[];
  /** Failure message for error/failed runs (strip body, not just chip). */
  error?: string | null;
};
