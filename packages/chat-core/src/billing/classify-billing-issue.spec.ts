import { describe, expect, it } from 'vitest';
import { classifyChatBillingIssue } from './classify-billing-issue.js';

describe('classifyChatBillingIssue', () => {
  it('maps stable codes', () => {
    expect(classifyChatBillingIssue({ code: 'INSUFFICIENT_CREDITS' })?.code).toBe(
      'INSUFFICIENT_CREDITS',
    );
    expect(classifyChatBillingIssue({ code: 'spending_limit' })?.code).toBe('SPENDING_LIMIT');
  });

  it('maps soft-fail kinds', () => {
    expect(classifyChatBillingIssue({ kind: 'insufficient_credits' })?.code).toBe(
      'INSUFFICIENT_CREDITS',
    );
    expect(classifyChatBillingIssue({ kind: 'agent_usage_limit' })?.code).toBe('AGENT_USAGE_LIMIT');
  });

  it('maps message heuristics', () => {
    expect(classifyChatBillingIssue({ message: 'Insufficient credits' })?.code).toBe(
      'INSUFFICIENT_CREDITS',
    );
    expect(classifyChatBillingIssue({ message: 'Daily agent usage limit reached' })?.code).toBe(
      'AGENT_USAGE_LIMIT',
    );
  });
});
