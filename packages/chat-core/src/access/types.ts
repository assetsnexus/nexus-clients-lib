/**
 * Client-side view of the region agent-access decision.
 * The region contract is the source of truth; these fields match AccessDecisionV1.
 */

export type FundedModality =
  | 'chat'
  | 'vision'
  | 'stt'
  | 'tts'
  | 'realtime'
  | 'image'
  | 'embedding';

export type AgentAccessTarget =
  | { kind: 'asset_agent'; assetId: string; agentKey: string }
  | { kind: 'virtual_employee'; veId: string };

export interface CoverageRow {
  id: string;
  source: 'subscription' | 'byok' | 'proxy_key';
  label: string;
  covers: Partial<Record<FundedModality, boolean>>;
  /** Catalog model keys this row can serve, when the list endpoints return them. */
  modelRefs?: string[];
  disabledReason?: string;
}

export interface ByoOptions {
  marginBps: number;
  minPerTurnMillicents: number;
  models: Partial<Record<FundedModality, string>>;
  rows: CoverageRow[];
}

export interface ResaleUnitPrice {
  modality: FundedModality;
  unit: string;
  priceMinorPerDisplayUnit: number;
  modelKey: string;
}

export interface ResaleOffer {
  marginBps: number;
  minPassMinor: number;
  maxPassMinor?: number;
  passTtlHours: number;
  models: Partial<Record<FundedModality, string>>;
  unitPrices: ResaleUnitPrice[];
  realtimeAvailable: boolean;
  realtimeUnavailableReason?: string;
}

export type AccessDecision =
  | { mode: 'owner' }
  | { mode: 'sponsored'; remainingMillicents: number; resetsAt: string; allowanceMillicents?: { daily?: number; weekly?: number } }
  | {
      mode: 'caller_required';
      options: { byo?: ByoOptions; ownerResale?: ResaleOffer };
      reason?: string;
    }
  | { mode: 'funded'; grantId: string; funding: 'byo' | 'owner_resale'; remainingMillicents: number }
  | { mode: 'denied'; reason: string };

export interface SubscriptionLimitSwitch {
  code: 'SUBSCRIPTION_LIMIT_REACHED';
  failedFunding: 'byo' | 'owner_resale';
  alternateFunding: 'byo' | 'owner_resale';
  message: string;
}

export type FundingGatePhase = 'closed' | 'meter' | 'open' | 'switch' | 'denied' | 'login_required';

export interface FundingGateState {
  phase: FundingGatePhase;
  decision: AccessDecision | null;
  /** The funding the room is attached to. A limit does not change this on its own. */
  activeFunding: 'owner' | 'sponsor' | 'byo' | 'owner_resale' | null;
  grantId: string | null;
  /** What the user picked in the dialog. Applied only after grant create or pass purchase. */
  selectedFunding: 'byo' | 'owner_resale' | null;
  switchOffer: SubscriptionLimitSwitch | null;
  reason: string | null;
  /** Set when an anonymous guest must sign in. The link and the QR use this URL. */
  loginUrl: string | null;
}
