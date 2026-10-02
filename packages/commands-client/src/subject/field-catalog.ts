export const FIELD_PURPOSE_MAX = 280;
export const FIELD_CATALOG_MAX = 32;
export const AGE_OVER_MIN = 1;
export const AGE_OVER_MAX = 120;

const FIXED_FIELDS = new Set([
  'email',
  'phone',
  'display_name',
  'legal_name',
  'birth_date',
  'birth_year',
  'country',
]);

const AGE_OVER = /^age_over:(\d{1,3})$/;

export class FieldClaimValidationError extends Error {
  readonly code = 'FIELD_CONSENT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'FieldClaimValidationError';
  }
}

export function isAgeOverField(field: string): boolean {
  const match = AGE_OVER.exec(field);
  if (!match) return false;
  const years = Number(match[1]);
  return Number.isInteger(years) && years >= AGE_OVER_MIN && years <= AGE_OVER_MAX;
}

export function isCatalogField(field: string): boolean {
  return FIXED_FIELDS.has(field) || isAgeOverField(field);
}

export function stripFieldPurpose(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FIELD_PURPOSE_MAX);
}

/** Canonicalize a batched field request before it is sent. */
export function normalizeFieldRequest(
  raw: Array<{ field?: unknown; purpose?: unknown }>,
): Array<{ field: string; purpose?: string }> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new FieldClaimValidationError('fields must be a non-empty array');
  }
  if (raw.length > FIELD_CATALOG_MAX) {
    throw new FieldClaimValidationError(`At most ${FIELD_CATALOG_MAX} field claims are allowed`);
  }
  const seen = new Set<string>();
  const out: Array<{ field: string; purpose?: string }> = [];
  for (const entry of raw) {
    const field = typeof entry?.field === 'string' ? entry.field.trim() : '';
    if (!isCatalogField(field)) {
      throw new FieldClaimValidationError(`Unknown field claim: ${field || '(empty)'}`);
    }
    if (seen.has(field)) {
      throw new FieldClaimValidationError(`Duplicate field claim: ${field}`);
    }
    seen.add(field);
    const purpose = entry.purpose === undefined ? '' : stripFieldPurpose(entry.purpose);
    out.push(purpose ? { field, purpose } : { field });
  }
  return out;
}
