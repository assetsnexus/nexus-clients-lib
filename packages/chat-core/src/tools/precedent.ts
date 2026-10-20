/**
 * Precedent-used chip model.
 *
 * When the agent applies a remembered decision, the `decision_usage` record_use
 * result (or a `precedent_found` ask result / `find-similar` match) carries the
 * decision it used. The host renders a small "Precedent used" chip with a
 * "Not applicable" action that flags a false positive.
 *
 * Pure and tolerant: a run with no recognisable precedent payload yields null,
 * so the host never renders an empty chip.
 */

export type PrecedentUse = {
  decisionId: string;
  /** Short generalized summary the chip shows. */
  summary: string | null;
  /** Filled after record_use; lets the chip flag that exact usage. */
  usageId: string | null;
  /** The agent's/decision's scope label, when supplied. */
  scope: string | null;
  /** Labels of the options the precedent chose, when supplied. */
  chosenLabels: string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function labelsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => str(entry) ?? str(asRecord(entry)?.label))
    .filter((label): label is string => Boolean(label));
}

/**
 * Parse a tool result (decision_usage `record_use`, ask `precedent_found`, or
 * `find-similar`) into the chip model. Returns null when no decision id is
 * present, so unrelated tool runs never render a chip.
 */
export function parsePrecedentUse(result: unknown): PrecedentUse | null {
  const data = asRecord(result);
  if (!data) return null;
  // Nested shapes: { decision: { decisionId, summary } }, { match: {...} }.
  const nested = asRecord(data.decision) ?? asRecord(data.match) ?? data;
  const decisionId =
    str(nested.decisionId) ??
    str(nested.id) ??
    str(data.decisionId) ??
    str(data.decision_id);
  if (!decisionId) return null;
  return {
    decisionId,
    summary: str(nested.summary) ?? str(data.summary),
    usageId: str(data.usageId) ?? str(nested.usageId),
    scope: str(nested.scope) ?? str(data.scope),
    chosenLabels: labelsOf(nested.chosenLabels ?? data.chosenLabels),
  };
}

/** The "Not applicable" reason is required server-side; keep a safe default. */
export const PRECEDENT_NOT_APPLICABLE_DEFAULT_REASON = 'Did not fit this case';
