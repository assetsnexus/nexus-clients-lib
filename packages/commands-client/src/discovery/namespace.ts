import type { NexusClient } from '../client.js';

export type CatalogMeta = {
  catalogVersion: string;
  catalogFingerprint: string;
  commandCount: number;
  deprecatedCount: number;
  generatedAt: string;
  regionSlug?: string;
};

export type CommandDescriptor = {
  name: string;
  description?: string;
  metadata?: {
    version?: string;
    deprecated?: boolean;
    replacedBy?: string;
    permissionDomain?: string;
    permissionAction?: string;
  };
  allowed?: boolean;
  allowedReason?: string;
  parameters?: unknown[];
  returns?: unknown;
  examples?: unknown[];
};

export class DiscoveryNamespace {
  constructor(private client: NexusClient) {}

  async getCatalogMeta(): Promise<CatalogMeta> {
    return this.client.getJson<CatalogMeta>('/commands/meta');
  }

  async listCommands(opts?: {
    annotatePermissions?: boolean;
  }): Promise<CommandDescriptor[]> {
    const q = opts?.annotatePermissions ? '?annotatePermissions=1' : '';
    const body = await this.client.getJson<{ commands?: CommandDescriptor[] } | CommandDescriptor[]>(
      `/commands${q}`,
    );
    if (Array.isArray(body)) return body;
    return body.commands || [];
  }

  async listDeprecated(): Promise<CommandDescriptor[]> {
    const body = await this.client.getJson<{ commands?: CommandDescriptor[] } | CommandDescriptor[]>(
      '/commands/deprecated',
    );
    if (Array.isArray(body)) return body;
    return body.commands || [];
  }
}
