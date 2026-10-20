/**
 * `ask_user_choice` client contract — the question card's data and the answer
 * the host submits back.
 *
 * The question the agent asked lives on the conversation (`openQuestion`) and is
 * the record an answer is validated against server-side. This module owns the
 * shared shapes + parsers so every adapter (React, Vue2, Vue3, app webview)
 * renders the same card and submits the same payload.
 *
 * Backward compatibility: the legacy `parseUserChoiceOptions` (labels only, from
 * a tool row's args/result) stays in `media-result.ts` and is re-exported here;
 * the new typed helpers are additive.
 *
 * @module tools/ask-user-choice
 */

/** One offered option on the card. Mirrors inference `AskUserChoiceOption`. */
export type UserChoiceQuestionOption = {
  id: string;
  label: string;
  description?: string;
  /** At most one option may be marked; the card badges it as recommended. */
  recommended?: boolean;
};

/** Where a question is asked. `chatter` is the in-thread card. */
export type UserChoiceQuestionTarget =
  | { kind: 'chatter' }
  | { kind: 'group'; groupId: string };

export type UserChoiceQuestionStatus = 'open' | 'answered' | 'expired' | 'cancelled';

/** The stored question the card renders and an answer is validated against. */
export type UserChoiceQuestion = {
  questionId: string;
  question: string;
  options: UserChoiceQuestionOption[];
  multiSelect: boolean;
  target: UserChoiceQuestionTarget;
  rememberDecision: boolean;
  topicKey: string | null;
  summary: string | null;
  urgency: string;
  deadlineSeconds: number | null;
  onTimeout: 'decide_self' | 'wait' | string;
  status: UserChoiceQuestionStatus;
  askedAt: string;
  deadlineAt: string | null;
  answeredAt?: string | null;
};

/** Scopes a remembered decision may be persisted to. */
export type PersistScope = 'user' | 'org' | 'agent';

/** Persist-mode controls for a `remember_decision` question. */
export type PersistChoice = {
  enabled?: boolean;
  scope?: PersistScope;
  why?: string | null;
};

/** The answer a host submits; validated server-side against the stored question. */
export type QuestionAnswer = {
  questionId: string;
  selectedIds: string[];
  customText?: string | null;
  explanation?: string | null;
  persist?: PersistChoice | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : null;

function parseOptions(raw: unknown): UserChoiceQuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const options: UserChoiceQuestionOption[] = [];
  for (const entry of raw) {
    const o = asRecord(entry);
    if (!o) continue;
    const label = str(o.label);
    if (!label) continue;
    options.push({
      id: str(o.id) ?? label,
      label,
      ...(str(o.description) ? { description: str(o.description)! } : {}),
      ...(o.recommended === true ? { recommended: true } : {}),
    });
  }
  return options;
}

function parseTarget(raw: unknown): UserChoiceQuestionTarget {
  const o = asRecord(raw);
  const groupId = o ? str(o.groupId) : null;
  if (groupId) return { kind: 'group', groupId };
  return { kind: 'chatter' };
}

/**
 * Parse a stored question / `ask_user_choice` tool result into the card model.
 * Returns null when no question id or body is present, so a host never renders
 * an empty card. Accepts both the stored `openQuestion` doc and the tool result
 * (which carries the same field names).
 */
export function parseUserChoiceQuestion(raw: unknown): UserChoiceQuestion | null {
  const d = asRecord(raw);
  if (!d) return null;
  const questionId = str(d.questionId);
  const question = str(d.question);
  if (!questionId || !question) return null;
  const status = str(d.status);
  return {
    questionId,
    question,
    options: parseOptions(d.options),
    multiSelect: d.multiSelect === true,
    target: parseTarget(d.target),
    rememberDecision: d.rememberDecision === true,
    topicKey: str(d.topicKey),
    summary: str(d.summary),
    urgency: str(d.urgency) ?? 'normal',
    deadlineSeconds: num(d.deadlineSeconds),
    onTimeout: str(d.onTimeout) ?? 'wait',
    status:
      status === 'answered' || status === 'expired' || status === 'cancelled'
        ? status
        : 'open',
    askedAt: str(d.askedAt) ?? '',
    deadlineAt: str(d.deadlineAt),
    answeredAt: str(d.answeredAt),
  };
}

/**
 * Build the answer payload from the card selection. Empty `selectedIds` and no
 * text is rejected by the server ("choose at least one option or write an
 * answer"), so this only trims and de-duplicates; it never invents a choice.
 */
export function buildQuestionAnswer(input: {
  questionId: string;
  selectedIds?: string[];
  customText?: string | null;
  explanation?: string | null;
  persist?: PersistChoice | null;
}): QuestionAnswer {
  const seen = new Set<string>();
  const selectedIds: string[] = [];
  for (const raw of input.selectedIds ?? []) {
    const id = str(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    selectedIds.push(id);
  }
  const scope = input.persist?.scope;
  const persist: PersistChoice | null = input.persist
    ? {
        ...(input.persist.enabled === undefined ? {} : { enabled: input.persist.enabled }),
        ...(scope === 'user' || scope === 'org' || scope === 'agent' ? { scope } : {}),
        why: str(input.persist.why),
      }
    : null;
  return {
    questionId: input.questionId,
    selectedIds,
    customText: str(input.customText),
    explanation: str(input.explanation),
    ...(persist ? { persist } : {}),
  };
}

/** True when the answer has at least one option or some free text. */
export function questionAnswerIsActionable(answer: QuestionAnswer): boolean {
  return answer.selectedIds.length > 0 || !!str(answer.customText);
}

/** True when an open question has passed its own deadline (client-side hint). */
export function userChoiceQuestionIsExpired(
  question: UserChoiceQuestion | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!question || question.status !== 'open') return false;
  const at = question.deadlineAt ? Date.parse(question.deadlineAt) : NaN;
  return Number.isFinite(at) ? nowMs > at : false;
}
