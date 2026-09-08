import type { NexusClient } from '../client.js';

export type EffectiveCapability = {
  command: string;
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
};

export type GrantView = {
  grantId: string;
  clientId: string;
  subjectType?: string;
  status: string;
  disabledReason?: string;
  grantedCommands?: string[];
  builtins?: string[];
  optionalDeclined?: string[];
  approvalOverrides?: Record<string, unknown>;
  autoRevokeAt?: string;
  inactivityDisableDueAt?: string;
  lastUsedAt?: string;
  scopeVersion?: number;
  activeTier?: unknown[];
  effectiveCapabilities?: EffectiveCapability[];
  approvalPolicy?: unknown;
};

export class GrantNamespace {
  constructor(private client: NexusClient) {}

  async self(): Promise<GrantView | null> {
    const res = await this.client.send<GrantView>('anx.oauth2.grants.get', { self: true });
    if (!res.ok) return null;
    return res.data;
  }

  async capabilities(): Promise<EffectiveCapability[]> {
    const grant = await this.self();
    return grant?.effectiveCapabilities || [];
  }

  async approvalPolicy(): Promise<unknown> {
    const grant = await this.self();
    return grant?.approvalPolicy ?? null;
  }

  async usage(params?: { fromDay?: string; toDay?: string }): Promise<unknown> {
    const res = await this.client.send('anx.oauth2.grants.usage-stats', params || {});
    if (!res.ok) throw new Error(res.error.message || 'usage failed');
    return res.data;
  }

  async calls(params?: {
    limit?: number;
    offset?: number;
    command?: string;
    outcome?: string;
    from?: string;
    to?: string;
  }): Promise<unknown> {
    const res = await this.client.send('anx.oauth2.grants.calls', params || {});
    if (!res.ok) throw new Error(res.error.message || 'calls failed');
    return res.data;
  }
}
