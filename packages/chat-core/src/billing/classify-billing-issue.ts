import type { ChatBillingIssueCode, ChatBillingIssueState } from '../types.js';

const BILLING_CODES = new Set<string>([
  'INSUFFICIENT_CREDITS',
  'SUBSCRIPTION_INACTIVE',
  'SPENDING_LIMIT',
  'AGENT_USAGE_LIMIT',
  'CREDIT_DISPATCH_SUSPENDED',
]);

export function isChatBillingIssueCode(code: unknown): code is ChatBillingIssueCode {
  return typeof code === 'string' && BILLING_CODES.has(code);
}

/**
 * Classify billing / quota failures from stream error data or command soft-fail.
 */
export function classifyChatBillingIssue(input: {
  code?: unknown;
  kind?: unknown;
  message?: unknown;
}): ChatBillingIssueState | null {
  const rawCode = String(input.code || '').trim();
  const upper = rawCode.toUpperCase().replace(/-/g, '_');
  if (isChatBillingIssueCode(upper)) {
    return {
      code: upper,
      message: typeof input.message === 'string' ? input.message : null,
      at: new Date().toISOString(),
    };
  }

  const kind = String(input.kind || '').toLowerCase();
  if (kind === 'insufficient_credits') {
    return {
      code: 'INSUFFICIENT_CREDITS',
      message: typeof input.message === 'string' ? input.message : null,
      at: new Date().toISOString(),
    };
  }
  if (kind === 'subscription_inactive') {
    return {
      code: 'SUBSCRIPTION_INACTIVE',
      message: typeof input.message === 'string' ? input.message : null,
      at: new Date().toISOString(),
    };
  }
  if (kind === 'spending_limit') {
    return {
      code: 'SPENDING_LIMIT',
      message: typeof input.message === 'string' ? input.message : null,
      at: new Date().toISOString(),
    };
  }
  if (kind === 'agent_usage_limit') {
    return {
      code: 'AGENT_USAGE_LIMIT',
      message: typeof input.message === 'string' ? input.message : null,
      at: new Date().toISOString(),
    };
  }

  const text = String(input.message || '');
  if (/subscription.*(inactive|required)|requires an active matching ai subscription/i.test(text)) {
    return { code: 'SUBSCRIPTION_INACTIVE', message: text || null, at: new Date().toISOString() };
  }
  if (/insufficient credits|spendable credit balance is too low/i.test(text)) {
    return { code: 'INSUFFICIENT_CREDITS', message: text || null, at: new Date().toISOString() };
  }
  if (/spending limit reached/i.test(text)) {
    return { code: 'SPENDING_LIMIT', message: text || null, at: new Date().toISOString() };
  }
  if (/agent usage limit reached/i.test(text)) {
    return { code: 'AGENT_USAGE_LIMIT', message: text || null, at: new Date().toISOString() };
  }
  if (/credit.*dispatch.*suspend|dispatch suspended/i.test(text)) {
    return {
      code: 'CREDIT_DISPATCH_SUSPENDED',
      message: text || null,
      at: new Date().toISOString(),
    };
  }
  return null;
}
