import type { CoverageRow, FundedModality } from './types.js';

/**
 * A row covers a modality when the region marked it, or when its model refs
 * include the model the agent (or the user) selected for that modality.
 * Rows that do not cover stay in the list with a reason.
 */
export function rowCoversModality(row: CoverageRow, modality: FundedModality, modelKey?: string | null): boolean {
  if (row.disabledReason) return false;
  const marked = row.covers?.[modality];
  if (marked === true) return true;
  if (marked === false) return false;
  if (!modelKey) return false;
  return Array.isArray(row.modelRefs) && row.modelRefs.includes(modelKey);
}

export function annotateCoverage(
  rows: CoverageRow[],
  modality: FundedModality,
  modelKey?: string | null,
): Array<CoverageRow & { coversModel: boolean }> {
  return rows.map((row) => {
    const coversModel = rowCoversModality(row, modality, modelKey);
    if (coversModel) return { ...row, coversModel };
    return {
      ...row,
      coversModel: false,
      disabledReason: row.disabledReason || `does not include ${modelKey || modality}`,
    };
  });
}

export function coverageByModality(
  rows: CoverageRow[],
  models: Partial<Record<FundedModality, string>>,
): Record<string, { covered: number; total: number }> {
  const out: Record<string, { covered: number; total: number }> = {};
  for (const [modality, modelKey] of Object.entries(models)) {
    const annotated = annotateCoverage(rows, modality as FundedModality, modelKey);
    out[modality] = {
      covered: annotated.filter((row) => row.coversModel).length,
      total: annotated.length,
    };
  }
  return out;
}
