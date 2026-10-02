/** Partner-facing shapes for R3 login requirements, R4 fields, and R5 catalog groups. */

export type MinVerificationLevel = 0 | 1 | 2;

export type RequirementBundleTarget = 'user' | 'org';

export type RequirementBundle = {
  slug: string;
  target: RequirementBundleTarget;
};

/** Stored on the OAuth client. Unset `defaultSubjectType` keeps the region org-id heuristic. */
export type LoginRequirements = {
  minVerificationLevel: MinVerificationLevel;
  requiredBundles: RequirementBundle[];
};

export type DefaultSubjectType = 'user' | 'org_member';

export type RequirementAction =
  | { type: 'add_contact'; channel?: string }
  | { type: 'verify_contact'; channel?: string }
  | {
      type: 'open_regulatory_bundle';
      portalPath: string;
      returnUrl?: string;
      bundleSlug?: string;
    };

/** `anx.oauth2.authorize.info` requirements block. */
export type AuthorizeRequirements = {
  met: boolean;
  missing: string[];
  actions: RequirementAction[];
};

export type DataAccessMode = 'on_request' | 'allow_all' | 'deny';

/**
 * Consent / wizard group. Storage and contacts set `resourceScoped` so the UI
 * shows resource pickers instead of a plain checkbox.
 */
export type CatalogGroup = {
  key: string;
  label: string;
  subPortal?: string;
  readOnly?: boolean;
  read: string[];
  write: string[];
  dataDomains?: string[];
  resourceScoped?: boolean;
};

export type RegulatoryStatusKind = 'kyc' | 'kyb' | 'age' | 'identity';
export type RegulatoryStatusValue =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'none';
export type RegulatoryStatusTarget = 'user' | 'org';

export type RegulatoryStatusRow = {
  bundleSlug: string;
  kind: RegulatoryStatusKind;
  target: RegulatoryStatusTarget;
  status: RegulatoryStatusValue;
  verifiedAt?: string;
  expiresAt?: string;
};

export type RegulatoryStatusResult = {
  statuses: RegulatoryStatusRow[];
  /** RS256 JWS. `aud` is the client id. Lifetime is about five minutes. */
  attestation: string;
  attestationExpiresAt: string;
};

export type RegulatoryAttestationClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  typ: 'anx-regulatory-status';
  grantId: string;
  subjectType: 'user' | 'org_member';
  statuses: RegulatoryStatusRow[];
  exp: number;
  iat?: number;
};

export type SubjectIdentity = {
  subjectType: 'user' | 'org_member';
  sub: string;
  grantId: string;
  organization?: {
    orgId: string;
    name?: string;
    logoUrl?: string;
  };
};

export type SubjectIdentitiesResult = {
  identities: SubjectIdentity[];
};

export type FieldOmittedReason = 'not_verified' | 'unavailable';

export type FieldsGetResult = {
  fields: Record<string, unknown>;
  omitted: Array<{ field: string; reason: FieldOmittedReason }>;
};

export type FieldRequestItem = {
  field: string;
  purpose?: string;
};

export type FieldsRequestResult = {
  requestId: string | null;
  alreadyGranted: string[];
  pending: string[];
};
