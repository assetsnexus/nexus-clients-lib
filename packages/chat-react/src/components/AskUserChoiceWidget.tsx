import { useState } from 'react';
import type { NexusChat, PlanPointer, UserChoiceQuestion } from '@nexus/chat-core';
import { planProgressLabel, type PlanTodoItem } from '@nexus/chat-core';

/** The conversation's compact plan pointer → the card's render model. */
export function planFromPointer(pointer: PlanPointer): {
  title: string;
  status?: string | null;
  todos: PlanTodoItem[];
} {
  return {
    title: pointer.title || 'Active plan',
    status: pointer.status,
    todos: pointer.todos,
  };
}

/**
 * The `ask_user_choice` question card. Offers the agent's options (single or
 * multi-select) and a free-text fallback, then submits a structured
 * `questionAnswer` so the server validates it against the stored question
 * instead of trusting free text.
 */
export function AskUserChoiceWidget({
  question,
  chat,
  conversationId,
  onAnswered,
}: {
  question: UserChoiceQuestion;
  chat: NexusChat;
  conversationId?: string | null;
  onAnswered?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (question.multiSelect) {
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      }
      return prev.includes(id) ? [] : [id];
    });
  };

  const actionable = selected.length > 0 || customText.trim().length > 0;

  const submit = async () => {
    if (!actionable) return;
    setBusy(true);
    setError(null);
    try {
      const result = await chat.answerQuestion({
        questionId: question.questionId,
        selectedIds: selected,
        customText: customText.trim() || null,
        conversationId: conversationId ?? undefined,
      });
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        setError(result.message || 'Failed to send answer');
        return;
      }
      onAnswered?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nexus-chat__grant-card nexus-ask-choice" role="region" aria-label="Agent question">
      <strong>{question.question}</strong>
      {question.summary ? <p className="nexus-chat__muted">{question.summary}</p> : null}
      <div className="nexus-ask-choice__options">
        {question.options.map((opt) => (
          <label key={opt.id} className="nexus-ask-choice__option">
            <input
              type={question.multiSelect ? 'checkbox' : 'radio'}
              name={`ask-${question.questionId}`}
              checked={selected.includes(opt.id)}
              disabled={busy}
              onChange={() => toggle(opt.id)}
            />{' '}
            {opt.label}
            {opt.recommended ? <span className="nexus-chat__muted"> (recommended)</span> : null}
            {opt.description ? <span className="nexus-chat__muted"> — {opt.description}</span> : null}
          </label>
        ))}
      </div>
      <input
        className="nexus-ask-choice__custom"
        type="text"
        placeholder="Or type your own answer…"
        aria-label="Type your own answer"
        value={customText}
        disabled={busy}
        onChange={(e) => setCustomText(e.target.value)}
      />
      <div className="nexus-chat__grant-actions">
        <button
          type="button"
          className="nexus-chat__btn nexus-chat__btn--primary"
          disabled={busy || !actionable}
          onClick={() => void submit()}
        >
          Send
        </button>
      </div>
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}

/**
 * Compact plan card: title, status, and the todo checklist with a progress
 * label — the same projection the model's Active-plan context segment uses.
 */
export function PlanCardView({
  plan,
}: {
  plan: {
    title: string;
    status?: string | null;
    description?: string;
    todos: PlanTodoItem[];
  };
}) {
  return (
    <div className="nexus-chat__plan-card" role="region" aria-label="Active plan">
      <div className="nexus-chat__plan-head">
        <strong>{plan.title}</strong>
        <span className="nexus-chat__muted">
          {plan.status || 'active'} · {planProgressLabel(plan.todos).label}
        </span>
      </div>
      {plan.description ? <p className="nexus-chat__muted">{plan.description}</p> : null}
      <ul className="nexus-chat__plan-todos">
        {plan.todos.map((todo) => (
          <li key={todo.index} className={`nexus-chat__plan-todo nexus-chat__plan-todo--${todo.status}`}>
            {todo.status === 'done' ? '✓' : todo.status === 'cancelled' ? '✕' : todo.status === 'in_progress' ? '▸' : '○'}{' '}
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
