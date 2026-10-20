import { describe, expect, it } from 'vitest';
import {
  buildQuestionAnswer,
  parseUserChoiceQuestion,
  questionAnswerIsActionable,
} from './ask-user-choice.js';

describe('buildQuestionAnswer', () => {
  it('dedupes and trims selected ids, and omits persist when absent', () => {
    const answer = buildQuestionAnswer({
      questionId: 'q1',
      selectedIds: ['a', ' a ', 'b'],
      customText: '  note  ',
    });
    expect(answer).toEqual({
      questionId: 'q1',
      selectedIds: ['a', 'b'],
      customText: 'note',
      explanation: null,
    });
  });

  it('carries persist controls, normalising scope and why', () => {
    const answer = buildQuestionAnswer({
      questionId: 'q1',
      selectedIds: ['a'],
      persist: { enabled: false, scope: 'org', why: '  because  ' },
    });
    expect(answer.persist).toEqual({ enabled: false, scope: 'org', why: 'because' });
  });

  it('drops an unknown persist scope rather than forwarding it', () => {
    const answer = buildQuestionAnswer({
      questionId: 'q1',
      selectedIds: ['a'],
      persist: { scope: 'global' as never },
    });
    expect(answer.persist).toEqual({ why: null });
  });

  it('is actionable with an option or free text only', () => {
    expect(questionAnswerIsActionable(buildQuestionAnswer({ questionId: 'q', selectedIds: ['a'] }))).toBe(true);
    expect(questionAnswerIsActionable(buildQuestionAnswer({ questionId: 'q', customText: 'x' }))).toBe(true);
    expect(questionAnswerIsActionable(buildQuestionAnswer({ questionId: 'q' }))).toBe(false);
  });
});

describe('parseUserChoiceQuestion', () => {
  it('reads the stored question including rememberDecision', () => {
    const q = parseUserChoiceQuestion({
      questionId: 'q1',
      question: 'Which plan?',
      options: [{ id: 'a', label: 'A', recommended: true }],
      multiSelect: true,
      rememberDecision: true,
      topicKey: 'plan.tier',
      status: 'open',
      askedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(q).toMatchObject({
      questionId: 'q1',
      multiSelect: true,
      rememberDecision: true,
      topicKey: 'plan.tier',
      status: 'open',
    });
    expect(q?.options[0]).toMatchObject({ id: 'a', label: 'A', recommended: true });
  });

  it('returns null without an id or body', () => {
    expect(parseUserChoiceQuestion({ question: 'x' })).toBeNull();
    expect(parseUserChoiceQuestion({ questionId: 'q' })).toBeNull();
  });
});
