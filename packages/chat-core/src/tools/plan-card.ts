/**
 * Plan card contract — the read model for a conversation's active plan.
 *
 * The plan is authored by the agent with the L0 `plan` tool and stored as a
 * markdown row (`anx_agent_plans`); the conversation keeps only a cache pointer.
 * The card renders the same projection the server injects into the model's
 * Active-plan context segment (title, status, todos), so the card and the model
 * never disagree about what the plan says.
 *
 * Todos use the GFM task-list grammar the `plan` tool writes:
 *   - [ ] pending   - [>] in progress   - [x] done   - [-] cancelled
 * (`- [/]` is accepted on read as in-progress.)
 *
 * @module tools/plan-card
 */

export type PlanTodoStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export type PlanTodoItem = {
  /** 1-based position among todo lines (what `plan set_todo` targets by index). */
  index: number;
  status: PlanTodoStatus;
  text: string;
};

export type PlanCardStatus = 'draft' | 'active' | 'completed' | 'abandoned' | string;

/** Read model a plan card renders. */
export type PlanCard = {
  planId: string;
  title: string;
  description?: string;
  status: PlanCardStatus;
  revision: number | null;
  markdown?: string;
  todos: PlanTodoItem[];
  updatedAt?: string | null;
};

/** Compact conversation-pointer form (no body, todo digest only). */
export type PlanPointer = {
  planId: string;
  title?: string;
  status?: PlanCardStatus;
  revision?: number | null;
  todos: PlanTodoItem[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const TODO_LINE_RE = /^(\s*)-\s*\[([ xX>/-])\]\s*(.*)$/;

const STATUS_BY_MARKER: Record<string, PlanTodoStatus> = {
  ' ': 'pending',
  '>': 'in_progress',
  '/': 'in_progress',
  x: 'done',
  X: 'done',
  '-': 'cancelled',
};

/**
 * Extract the task-list todos from a plan markdown body. Mirrors the server
 * `listPlanTodos` so the card's checkboxes line up 1:1 with `plan set_todo`.
 */
export function parsePlanTodos(markdown: string | null | undefined): PlanTodoItem[] {
  const items: PlanTodoItem[] = [];
  const lines = (markdown ?? '').split('\n');
  for (const line of lines) {
    const match = TODO_LINE_RE.exec(line ?? '');
    if (!match) continue;
    const marker = match[2] ?? ' ';
    items.push({
      index: items.length + 1,
      status: STATUS_BY_MARKER[marker] ?? 'pending',
      text: (match[3] ?? '').trim(),
    });
  }
  return items;
}

/** Count todos by status; `total` is every task-list line. */
export function summarizePlanTodos(
  markdown: string | null | undefined,
): Record<PlanTodoStatus, number> & { total: number } {
  const summary = { pending: 0, in_progress: 0, done: 0, cancelled: 0, total: 0 };
  for (const todo of parsePlanTodos(markdown)) {
    summary[todo.status] += 1;
    summary.total += 1;
  }
  return summary;
}

/**
 * Parse a `plan` tool result into the card model. Accepts the `create` / `get`
 * shapes (which carry `markdown`) and the `set_todo` / `set_status` shapes
 * (which carry a `todos` summary array instead).
 */
export function parsePlanCard(raw: unknown): PlanCard | null {
  const d = asRecord(raw);
  if (!d) return null;
  const planId = str(d.planId);
  const title = str(d.title);
  if (!planId || !title) return null;

  const markdown = typeof d.markdown === 'string' ? d.markdown : undefined;
  const todos = markdown != null ? parsePlanTodos(markdown) : parsePlanTodoArray(d.todos);

  return {
    planId,
    title,
    ...(str(d.description) ? { description: str(d.description)! } : {}),
    status: str(d.status) ?? 'draft',
    revision: num(d.revision),
    ...(markdown != null ? { markdown } : {}),
    todos,
    updatedAt: str(d.updatedAt),
  };
}

function parsePlanTodoArray(raw: unknown): PlanTodoItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PlanTodoItem[] = [];
  for (const entry of raw) {
    const o = asRecord(entry);
    if (!o) continue;
    const text = str(o.text);
    if (!text) continue;
    items.push({
      index: items.length + 1,
      status: normalizePlanTodoStatus(o.status),
      text,
    });
  }
  return items;
}

export function normalizePlanTodoStatus(raw: unknown): PlanTodoStatus {
  const s = str(raw);
  if (s === 'in_progress' || s === 'done' || s === 'cancelled') return s;
  return 'pending';
}

/**
 * Parse the conversation's active-plan pointer (the `activePlan` cache) into the
 * compact card header. Returns null when the conversation has no plan.
 */
export function parsePlanPointer(raw: unknown): PlanPointer | null {
  const d = asRecord(raw);
  if (!d) return null;
  const planId = str(d.planId);
  if (!planId) return null;
  return {
    planId,
    ...(str(d.title) ? { title: str(d.title)! } : {}),
    ...(str(d.status) ? { status: str(d.status)! } : {}),
    revision: num(d.revision),
    todos: parsePlanTodoArray(d.todos),
  };
}

/** Progress label, e.g. `3/7 done` — how the card footers the checklist. */
export function planProgressLabel(
  todos: PlanTodoItem[],
): { done: number; total: number; label: string } {
  const total = todos.length;
  const done = todos.filter((t) => t.status === 'done' || t.status === 'cancelled').length;
  return { done, total, label: `${done}/${total} done` };
}
