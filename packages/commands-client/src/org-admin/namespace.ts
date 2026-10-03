import type { NexusClient } from '../client.js';
import { NexusError } from '../errors/nexus-error.js';
import { requireCommandData } from '../subject/require-command.js';

const SECURITY_POLICY_GET = 'anx.compliance.security-policy.get';
const SELF_STATUS_GET = 'anx.compliance.security-policy.self-status.get';
const ORG_OVERVIEW_GET = 'anx.compliance.org-overview.get';

export type MembershipLoginPassword = 'none' | 'user_password' | 'membership_password';
export type EnforcementMode = 'warn' | 'grace_then_block';

/** Public fields from `publicPolicy` in the security-policy command handler. */
export type OrgSecurityPolicyView = {
  orgId: string;
  enabled: boolean;
  requirePersonalPassword: boolean;
  membershipLoginPassword: MembershipLoginPassword;
  minTwoFactorFactors: number;
  enforcementMode: EnforcementMode;
  requireBiometric: boolean;
  graceDays?: number;
  passwordRotationDays?: number;
  totpRotationDays?: number;
  sessionMaxAgeMinutes?: number;
  idleTimeoutMinutes?: number;
};

export type OrgComplianceActivation = {
  slug: string;
  name: string;
  status: string;
  green: boolean;
};

export type OrgRegulatoryBundleRow = {
  slug: string;
  status: string;
};

export type OrgComplianceGap = {
  standard: string;
  reason: 'missing' | 'not_green';
};

/** `anx.compliance.org-overview.get` payload. */
export type OrgComplianceOverview = {
  orgId: string;
  securityPolicyEnabled: boolean;
  activations: OrgComplianceActivation[];
  regulatoryBundles: OrgRegulatoryBundleRow[];
  requiredGaps: OrgComplianceGap[];
  suggestions: Array<{ slug: string; name: string; reason: string }>;
};

export type SecurityPolicyWarning = {
  code: string;
  message: string;
  deadlineAt?: string;
};

/** `anx.compliance.security-policy.self-status.get` payload. */
export type SecurityPolicySelfStatus = {
  policy: OrgSecurityPolicyView | null;
  warnings: SecurityPolicyWarning[];
  missing: string[];
  blocked: boolean;
};

const PASSWORD_MODES = new Set<MembershipLoginPassword>(['none', 'user_password', 'membership_password']);

function readPolicy(data: unknown, command: string): OrgSecurityPolicyView {
  if (!data || typeof data !== 'object') {
    throw new NexusError('INVALID_RESPONSE', `${command} returned an invalid policy`);
  }
  const row = data as Record<string, unknown>;
  const mode = row.membershipLoginPassword;
  if (!PASSWORD_MODES.has(mode as MembershipLoginPassword)) {
    throw new NexusError('INVALID_RESPONSE', `${command} is missing membershipLoginPassword`);
  }
  return {
    orgId: typeof row.orgId === 'string' ? row.orgId : '',
    enabled: row.enabled === true,
    requirePersonalPassword: row.requirePersonalPassword === true,
    membershipLoginPassword: mode as MembershipLoginPassword,
    minTwoFactorFactors: typeof row.minTwoFactorFactors === 'number' ? row.minTwoFactorFactors : 0,
    enforcementMode: row.enforcementMode === 'grace_then_block' ? 'grace_then_block' : 'warn',
    requireBiometric: row.requireBiometric === true,
    ...(typeof row.graceDays === 'number' ? { graceDays: row.graceDays } : {}),
    ...(typeof row.passwordRotationDays === 'number' ? { passwordRotationDays: row.passwordRotationDays } : {}),
    ...(typeof row.totpRotationDays === 'number' ? { totpRotationDays: row.totpRotationDays } : {}),
    ...(typeof row.sessionMaxAgeMinutes === 'number' ? { sessionMaxAgeMinutes: row.sessionMaxAgeMinutes } : {}),
    ...(typeof row.idleTimeoutMinutes === 'number' ? { idleTimeoutMinutes: row.idleTimeoutMinutes } : {}),
  };
}

function readOverview(data: unknown): OrgComplianceOverview {
  if (!data || typeof data !== 'object') {
    throw new NexusError('INVALID_RESPONSE', 'org compliance overview is invalid');
  }
  const row = data as Record<string, unknown>;
  const activations = Array.isArray(row.activations) ? row.activations : null;
  const bundles = Array.isArray(row.regulatoryBundles) ? row.regulatoryBundles : null;
  const gaps = Array.isArray(row.requiredGaps) ? row.requiredGaps : null;
  if (!activations || !bundles || !gaps || typeof row.orgId !== 'string') {
    throw new NexusError('INVALID_RESPONSE', 'org compliance overview is invalid');
  }
  return {
    orgId: row.orgId,
    securityPolicyEnabled: row.securityPolicyEnabled === true,
    activations: activations.map((item) => {
      const entry = item as Record<string, unknown>;
      return {
        slug: String(entry.slug || ''),
        name: String(entry.name || ''),
        status: String(entry.status || ''),
        green: entry.green === true,
      };
    }),
    regulatoryBundles: bundles.map((item) => {
      const entry = item as Record<string, unknown>;
      return { slug: String(entry.slug || ''), status: String(entry.status || '') };
    }),
    requiredGaps: gaps.map((item) => {
      const entry = item as Record<string, unknown>;
      const reason = entry.reason === 'not_green' ? 'not_green' : 'missing';
      return { standard: String(entry.standard || ''), reason };
    }),
    suggestions: Array.isArray(row.suggestions)
      ? row.suggestions.map((item) => {
          const entry = item as Record<string, unknown>;
          return {
            slug: String(entry.slug || ''),
            name: String(entry.name || ''),
            reason: String(entry.reason || ''),
          };
        })
      : [],
  };
}

/**
 * Org-admin reads. These commands are unclassified for an app access token
 * and return APP_ACCESS_FORBIDDEN. Call them with the org member session or
 * an org API key — the same commands the ANX app and portal use.
 */
export class OrgAdminNamespace {
  constructor(private readonly client: NexusClient) {}

  async securityPolicy(): Promise<OrgSecurityPolicyView> {
    const result = await this.client.send<OrgSecurityPolicyView>(SECURITY_POLICY_GET, {}, { isRead: true });
    return readPolicy(requireCommandData(result, SECURITY_POLICY_GET), SECURITY_POLICY_GET);
  }

  async selfStatus(): Promise<SecurityPolicySelfStatus> {
    const result = await this.client.send<SecurityPolicySelfStatus>(SELF_STATUS_GET, {}, { isRead: true });
    const data = requireCommandData(result, SELF_STATUS_GET);
    if (!data || typeof data !== 'object') {
      throw new NexusError('INVALID_RESPONSE', 'security policy self-status is invalid');
    }
    return {
      policy: data.policy ? readPolicy(data.policy, SELF_STATUS_GET) : null,
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      missing: Array.isArray(data.missing) ? data.missing : [],
      blocked: data.blocked === true,
    };
  }

  async complianceOverview(): Promise<OrgComplianceOverview> {
    const result = await this.client.send<OrgComplianceOverview>(ORG_OVERVIEW_GET, {}, { isRead: true });
    return readOverview(requireCommandData(result, ORG_OVERVIEW_GET));
  }
}
