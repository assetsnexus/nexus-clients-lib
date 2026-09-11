import type { CommandClient, SendResult } from '../index.js';
import type {
  AgentRunPlan,
  AgentRunSummary,
  AgentRunTask,
  MessageDelivery,
} from './types.js';

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  if (r.response && typeof r.response === 'object') {
    const response = r.response as Record<string, unknown>;
    if (response.responseObject && typeof response.responseObject === 'object') {
      return response.responseObject as Record<string, unknown>;
    }
  }
  return r;
}

function assertOk(result: unknown, fallback: string): Record<string, unknown> {
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    const failure = result as Extract<SendResult, { ok: false }>;
    throw new Error(failure.message || `${fallback}: ${failure.kind}`);
  }
  return unwrapData(result);
}

function runIdPayload(id: { runId?: string | null; workloadId?: string | null }): Record<string, string> {
  const runId = typeof id.runId === 'string' && id.runId.trim() ? id.runId.trim() : '';
  const workloadId =
    typeof id.workloadId === 'string' && id.workloadId.trim() ? id.workloadId.trim() : '';
  const resolved = workloadId || runId;
  if (!resolved) throw new Error('runId or workloadId is required');
  return { workloadId: resolved, runId: runId || resolved };
}

export function mapAgentRunRow(row: Record<string, unknown> | null | undefined): AgentRunSummary | null {
  if (!row || typeof row !== 'object') return null;
  const runId = String(row.runId || row.workloadId || row._id || row.id || '').trim();
  if (!runId) return null;
  const plan =
    row.plan && typeof row.plan === 'object' ? (row.plan as AgentRunPlan) : null;
  const tasks = Array.isArray(row.tasks) ? (row.tasks as AgentRunTask[]) : [];
  return {
    runId,
    workloadId: row.workloadId != null ? String(row.workloadId) : runId,
    origin: row.origin != null ? String(row.origin) : null,
    status: String(row.status || row.state || 'unknown'),
    mission:
      typeof row.mission === 'string'
        ? row.mission
        : typeof (row.params as { mission?: unknown } | undefined)?.mission === 'string'
          ? String((row.params as { mission: string }).mission)
          : null,
    parentConversationId:
      row.parentConversationId != null ? String(row.parentConversationId) : null,
    linkedConversationId:
      row.linkedConversationId != null ? String(row.linkedConversationId) : null,
    costLimitMinor:
      typeof row.costLimitMinor === 'number'
        ? row.costLimitMinor
        : typeof row.costLimit === 'number'
          ? row.costLimit
          : null,
    costUsedMinor:
      typeof row.costUsedMinor === 'number'
        ? row.costUsedMinor
        : typeof row.costCents === 'number'
          ? row.costCents
          : null,
    plan,
    tasks,
    toolCallsSummary: row.toolCallsSummary ?? null,
    createdAt: row.createdAt != null ? String(row.createdAt) : null,
    updatedAt: row.updatedAt != null ? String(row.updatedAt) : null,
  };
}

export async function listAgentRuns(
  client: CommandClient,
  payload: Record<string, unknown> = {},
): Promise<{ items: AgentRunSummary[]; raw: Record<string, unknown> }> {
  const result = await client.send('anx.inference.workloads.list', payload);
  const data = assertOk(result, 'workloads.list failed');
  const rows = Array.isArray(data.items)
    ? (data.items as Record<string, unknown>[])
    : Array.isArray(data.workloads)
      ? (data.workloads as Record<string, unknown>[])
      : Array.isArray(data)
        ? (data as Record<string, unknown>[])
        : [];
  return {
    items: rows.map((r) => mapAgentRunRow(r)).filter(Boolean) as AgentRunSummary[],
    raw: data,
  };
}

export async function getAgentRun(
  client: CommandClient,
  id: { runId?: string | null; workloadId?: string | null },
): Promise<AgentRunSummary> {
  const result = await client.send('anx.inference.workloads.get', runIdPayload(id));
  const data = assertOk(result, 'workloads.get failed');
  const mapped = mapAgentRunRow(data);
  if (!mapped) throw new Error('workloads.get returned no run');
  return mapped;
}

export async function pauseAgentRun(
  client: CommandClient,
  id: { runId?: string | null; workloadId?: string | null },
): Promise<Record<string, unknown>> {
  const result = await client.send('anx.inference.workloads.pause', runIdPayload(id));
  return assertOk(result, 'workloads.pause failed');
}

export async function cancelAgentRun(
  client: CommandClient,
  id: { runId?: string | null; workloadId?: string | null },
): Promise<Record<string, unknown>> {
  const result = await client.send('anx.inference.workloads.cancel', runIdPayload(id));
  return assertOk(result, 'workloads.cancel failed');
}

export async function resumeAgentRun(
  client: CommandClient,
  id: { runId?: string | null; workloadId?: string | null },
): Promise<Record<string, unknown>> {
  const result = await client.send('anx.inference.workloads.resume', runIdPayload(id));
  return assertOk(result, 'workloads.resume failed');
}

export async function messageAgentRun(
  client: CommandClient,
  input: {
    runId?: string | null;
    workloadId?: string | null;
    text: string;
    delivery: MessageDelivery;
  },
): Promise<Record<string, unknown>> {
  const result = await client.send('anx.inference.workloads.message', {
    ...runIdPayload(input),
    text: String(input.text || ''),
    delivery: input.delivery,
  });
  return assertOk(result, 'workloads.message failed');
}

export async function getAgentRunPlan(
  client: CommandClient,
  id: { runId?: string | null; workloadId?: string | null },
): Promise<AgentRunPlan | null> {
  const result = await client.send('anx.inference.workloads.plan.get', runIdPayload(id));
  const data = assertOk(result, 'workloads.plan.get failed');
  if (data.plan && typeof data.plan === 'object') return data.plan as AgentRunPlan;
  if (data.title || data.steps) return data as AgentRunPlan;
  return null;
}

export async function listAgentRunTasks(
  client: CommandClient,
  id: { runId?: string | null; workloadId?: string | null },
): Promise<AgentRunTask[]> {
  const result = await client.send('anx.inference.workloads.tasks.list', runIdPayload(id));
  const data = assertOk(result, 'workloads.tasks.list failed');
  const rows = Array.isArray(data.tasks)
    ? data.tasks
    : Array.isArray(data.items)
      ? data.items
      : [];
  return rows as AgentRunTask[];
}

export async function updateAgentRunTask(
  client: CommandClient,
  input: {
    runId?: string | null;
    workloadId?: string | null;
    taskId: string;
    status?: string;
    title?: string;
    detail?: string | null;
  },
): Promise<Record<string, unknown>> {
  const result = await client.send('anx.inference.workloads.tasks.update', {
    ...runIdPayload(input),
    taskId: input.taskId,
    ...(input.status != null ? { status: input.status } : {}),
    ...(input.title != null ? { title: input.title } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  });
  return assertOk(result, 'workloads.tasks.update failed');
}
