export type RegionPublicEndpoints = {
  regionSlug: string;
  countryCode?: string;
  displayName?: string;
  publicBaseUrl: string;
  oauthIssuer?: string;
};

export type RegionResolver = {
  resolve(query: {
    countryCode?: string;
    regionSlug?: string;
    loginHintHash?: string;
  }): Promise<RegionPublicEndpoints | null>;
  list?(countryCode?: string): Promise<RegionPublicEndpoints[]>;
};

export class StaticRegionIndex implements RegionResolver {
  constructor(private regions: RegionPublicEndpoints[]) {}

  async resolve(query: {
    countryCode?: string;
    regionSlug?: string;
  }): Promise<RegionPublicEndpoints | null> {
    if (query.regionSlug) {
      return this.regions.find((r) => r.regionSlug === query.regionSlug) || null;
    }
    if (query.countryCode) {
      return (
        this.regions.find(
          (r) => r.countryCode?.toUpperCase() === query.countryCode!.toUpperCase(),
        ) || null
      );
    }
    return this.regions[0] || null;
  }

  async list(countryCode?: string): Promise<RegionPublicEndpoints[]> {
    if (!countryCode) return [...this.regions];
    return this.regions.filter(
      (r) => r.countryCode?.toUpperCase() === countryCode.toUpperCase(),
    );
  }
}

/**
 * Resolves regions via a region's public `anx.country.list` / `anx.region.list`
 * endpoints. Requires a bootstrap base URL (any known public region or docs BFF).
 */
export class CountryRegionResolver implements RegionResolver {
  constructor(
    private bootstrapBaseUrl: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async list(countryCode?: string): Promise<RegionPublicEndpoints[]> {
    const url = new URL('/commands', this.bootstrapBaseUrl.replace(/\/$/, ''));
    // Prefer dedicated list endpoints when available; fall back to static discovery docs.
    void url;
    const regionsUrl = `${this.bootstrapBaseUrl.replace(/\/$/, '')}/public/regions`;
    try {
      const res = await this.fetchImpl(regionsUrl);
      if (!res.ok) return [];
      const body = (await res.json()) as { items?: RegionPublicEndpoints[] };
      const items = body.items || [];
      if (!countryCode) return items;
      return items.filter(
        (r) => r.countryCode?.toUpperCase() === countryCode.toUpperCase(),
      );
    } catch {
      return [];
    }
  }

  async resolve(query: {
    countryCode?: string;
    regionSlug?: string;
  }): Promise<RegionPublicEndpoints | null> {
    const items = await this.list(query.countryCode);
    if (query.regionSlug) {
      return items.find((r) => r.regionSlug === query.regionSlug) || null;
    }
    return items[0] || null;
  }
}

/**
 * Declared for the future gateway hashed-login discovery flow.
 * Throws NOT_IMPLEMENTED until anx-gateway ships.
 */
export class GatewayRegionResolver implements RegionResolver {
  constructor(private _gatewayUrl: string) {}

  async resolve(_query: {
    countryCode?: string;
    regionSlug?: string;
    loginHintHash?: string;
  }): Promise<RegionPublicEndpoints | null> {
    const { NexusError } = await import('../errors/nexus-error.js');
    throw new NexusError('NOT_IMPLEMENTED', 'GatewayRegionResolver is not implemented yet', {
      meta: {
        docs: 'https://docs.assetsnexus.org/developers/integrate#gateway-discovery',
        gatewayUrl: this._gatewayUrl,
      },
    });
  }
}
