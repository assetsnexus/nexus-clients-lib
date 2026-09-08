export type TokenProvider = {
  getAccessToken(): Promise<string | null>;
  /** Optional refresh hook invoked on 401. Return true if a new token is available. */
  refresh?(): Promise<boolean>;
};

export class StaticTokenProvider implements TokenProvider {
  constructor(private token: string | null) {}

  async getAccessToken(): Promise<string | null> {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }
}

export class BearerTokenProvider implements TokenProvider {
  constructor(
    private getToken: () => string | null | Promise<string | null>,
    private onRefresh?: () => Promise<boolean>,
  ) {}

  async getAccessToken(): Promise<string | null> {
    return this.getToken();
  }

  async refresh(): Promise<boolean> {
    if (!this.onRefresh) return false;
    return this.onRefresh();
  }
}

export type IdentityContext = {
  userId?: string;
  orgId?: string;
  membershipId?: string;
  deviceId?: string;
  subjectType?: 'user' | 'org_member' | 'app';
};
