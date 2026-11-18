/**
 * Compliance kit: terms/privacy acceptance and subscription price changes.
 *
 * Same shape as the privacy-request kit next door — the app supplies a command
 * transport, this module owns the logic and the state machine. An app should
 * never re-implement "is this document accepted" or "does this price change
 * need a decision"; it renders what this returns.
 *
 * Generic on purpose: the commands are the Nexus app contract, so any app that
 * shows terms or sells subscriptions gets the same behaviour, and a future
 * compliance surface can be added here once rather than per app.
 */

/** The only thing an app has to provide: a way to call `anx.*` commands. */
export interface ComplianceCommandClient {
  command<T = unknown>(name: string, payload?: unknown): Promise<T>;
}

export type TermsDocumentKind = 'terms' | 'privacy' | 'dpa' | 'app_terms';

export type TermsState = 'accepted' | 'due' | 'expired' | 'not_required' | 'disabled';

export interface TermsDocumentStatus {
  kind: TermsDocumentKind;
  version: string;
  hash: string;
  url?: string;
  /** Optional human-readable diff; fall back to `url` when absent. */
  diffUrl?: string;
  /** A revision that does not change what the subject agreed to. */
  minor?: boolean;
  accepted: boolean;
  acceptedAt: string | null;
  dueAt: string | null;
  state: TermsState;
}

export interface TermsPolicy {
  graceDays: number;
  onExpiry: 'pause_app' | 'cancel_subscription' | 'gdpr_erasure_request' | 'notify_only';
  tracking: 'default' | 'required' | 'disabled';
  /** What the app declared; differs from `tracking` when overridden. */
  requestedTracking?: 'default' | 'required' | 'disabled';
  /** True when a jurisdiction forced tracking on over the app's choice. */
  trackingOverridden?: boolean;
}

export interface TermsStatus {
  documents: TermsDocumentStatus[];
  policy: TermsPolicy;
}

export type PriceChangeState =
  | 'not_applicable'
  | 'auto_accepted'
  | 'consent_required'
  | 'accepted'
  | 'declined'
  | 'expired';

export interface PriceChange {
  changeId: string;
  subscriptionId: string;
  offerId: string;
  currency: string;
  fromAmountMinor: number;
  toAmountMinor: number;
  changePct: number;
  windowIncreasePct: number;
  announcedAt: string;
  effectiveAt: string;
  dueAt: string | null;
  state: PriceChangeState;
  decision?: 'accepted' | 'declined';
}

export interface PriceChangeList {
  items: PriceChange[];
  /** How many changes still need an answer — these pause the subscription. */
  needsDecision: number;
}

export const COMPLIANCE_COMMANDS = {
  TERMS_STATUS: 'anx.oauth2.subject.terms.status',
  TERMS_ACCEPT: 'anx.oauth2.subject.terms.accept',
  PRICE_CHANGE_LIST: 'anx.marketplace.subscription.price-change.list',
  PRICE_CHANGE_DECIDE: 'anx.marketplace.subscription.price-change.decide',
  PRICE_CHANGE_AUTO_ACCEPT: 'anx.marketplace.subscription.price-change.auto-accept.set',
} as const;

export interface ComplianceKitOptions {
  command: ComplianceCommandClient;
  logger?: { warn(message: string, detail?: unknown): void };
}

export interface ComplianceKit {
  termsStatus(): Promise<TermsStatus>;
  acceptTerms(input: {
    kind: TermsDocumentKind;
    version?: string;
    hash?: string;
    locale?: string;
  }): Promise<{ acceptanceId: string; kind: TermsDocumentKind; version: string; hash: string; resumed: boolean }>;
  priceChanges(): Promise<PriceChangeList>;
  decidePriceChange(changeId: string, decision: 'accepted' | 'declined'): Promise<PriceChange>;
  setPriceChangeAutoAccept(subscriptionId: string, enabled: boolean): Promise<{ autoAccept: boolean }>;
  /**
   * Everything the app must show right now: documents that are due or expired,
   * and price changes that need a decision. One call for the gate.
   */
  pending(): Promise<{ terms: TermsDocumentStatus[]; priceChanges: PriceChange[] }>;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function createComplianceKit(options: ComplianceKitOptions): ComplianceKit {
  const { command, logger } = options;

  async function termsStatus(): Promise<TermsStatus> {
    const raw = await command.command<any>(COMPLIANCE_COMMANDS.TERMS_STATUS, {});
    return {
      documents: asArray<TermsDocumentStatus>(raw?.documents),
      policy: raw?.policy ?? {
        graceDays: 0,
        onExpiry: 'notify_only',
        tracking: 'default',
      },
    };
  }

  async function priceChanges(): Promise<PriceChangeList> {
    const raw = await command.command<any>(COMPLIANCE_COMMANDS.PRICE_CHANGE_LIST, {});
    return {
      items: asArray<PriceChange>(raw?.items),
      needsDecision: Number(raw?.needsDecision) || 0,
    };
  }

  return {
    termsStatus,
    priceChanges,

    async acceptTerms(input) {
      const raw = await command.command<any>(COMPLIANCE_COMMANDS.TERMS_ACCEPT, {
        kind: input.kind,
        ...(input.version !== undefined ? { version: input.version } : {}),
        ...(input.hash !== undefined ? { hash: input.hash } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      });
      return {
        acceptanceId: raw?.acceptanceId,
        kind: raw?.kind ?? input.kind,
        version: raw?.version ?? '',
        hash: raw?.hash ?? '',
        resumed: raw?.resumed === true,
      };
    },

    async decidePriceChange(changeId, decision) {
      return command.command<PriceChange>(COMPLIANCE_COMMANDS.PRICE_CHANGE_DECIDE, {
        changeId,
        decision,
      });
    },

    async setPriceChangeAutoAccept(subscriptionId, enabled) {
      const raw = await command.command<any>(COMPLIANCE_COMMANDS.PRICE_CHANGE_AUTO_ACCEPT, {
        subscriptionId,
        enabled: enabled === true,
      });
      return { autoAccept: raw?.autoAccept === true };
    },

    async pending() {
      // Both reads are independent; a failure in one must not hide the other.
      const [terms, changes] = await Promise.all([
        termsStatus().catch((err) => {
          logger?.warn('terms status unavailable', err);
          return { documents: [], policy: { graceDays: 0, onExpiry: 'notify_only', tracking: 'default' } } as TermsStatus;
        }),
        priceChanges().catch((err) => {
          logger?.warn('price changes unavailable', err);
          return { items: [], needsDecision: 0 } as PriceChangeList;
        }),
      ]);
      return {
        terms: terms.documents.filter((doc) => doc.state === 'due' || doc.state === 'expired'),
        priceChanges: changes.items.filter(
          (change) => change.state === 'consent_required' || change.state === 'expired',
        ),
      };
    },
  };
}
