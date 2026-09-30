import { useCallback, useEffect, useState } from 'react';
import type { CommandClient, NexusChat, PanelState } from '@nexus/chat-core';
import { contextUsagePercent, formatContextTokensLabel } from '../utils/context-percent.js';

function formatMinor(minor: number | undefined, currency?: string | null): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const cur = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${cur}`;
  }
}

export type ContextSpendChipProps = {
  panel: PanelState | null;
  chat: NexusChat;
  client?: CommandClient;
  conversationId?: string | null;
};

type ElevationRow = {
  elevationId: string;
  packs?: string[];
  status?: string;
  expiresAt?: string | null;
};

type ContextDetails = {
  toolCatalog?: {
    activePacks?: Array<{ name: string; toolCount?: number }>;
    blockedTools?: Array<{ name: string; reason?: string }>;
    cachedTokens?: number;
    uncachedTokens?: number;
    revision?: number;
    lastAssemble?: { added?: number; removed?: number };
  };
  memory?: { injectedTokens?: number; budgetTokens?: number | string; summaryLines?: number };
  skills?: Array<{ id: string; name: string; source?: string; enabled?: boolean }>;
  categories?: Array<{ category: string; tokens?: number; pct?: number }>;
  dispatchedTokens?: number;
  totalTokens?: number;
  maxContextTokens?: number;
  dispatchBudgetTokens?: number;
};

export function SpendChip({ panel, chat, client, conversationId }: ContextSpendChipProps) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<ContextDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [elevations, setElevations] = useState<ElevationRow[]>([]);
  const [elevationsLoading, setElevationsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [compactError, setCompactError] = useState<string | null>(null);
  const [compacting, setCompacting] = useState(false);

  const usage = panel?.usage;
  const credits = panel?.credits;
  const limits = panel?.spendLimits;
  const tokensUsed = usage?.tokensUsed;
  const maxTokens = usage?.maxContextTokens;
  const pct = contextUsagePercent(tokensUsed, maxTokens);

  const costLabel =
    usage?.displayCostMinor != null
      ? formatMinor(usage.displayCostMinor, usage.displayCurrency)
      : usage?.costCents != null
        ? `${(usage.costCents / 100).toFixed(2)} cr`
        : null;

  const parts: string[] = [];
  if (pct != null) parts.push(`${pct}%`);
  parts.push(formatContextTokensLabel(tokensUsed, maxTokens));
  if (costLabel) parts.push(costLabel);
  if (credits?.availableCents != null) parts.push(`bal ${(credits.availableCents / 100).toFixed(2)}`);
  if (limits?.reached) parts.push('limit reached');

  const convId = conversationId || panel?.conversationId || null;

  const fetchDetails = useCallback(async () => {
    if (!client?.send || !convId) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const result = (await client.send('anx.communicate.conversations.context-details', {
        conversationId: convId,
      })) as { responseObject?: ContextDetails; data?: ContextDetails; ok?: boolean; message?: string };
      setDetails(result?.responseObject || result?.data || null);
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : 'Failed to load context details');
    } finally {
      setDetailsLoading(false);
    }
  }, [client, convId]);

  const fetchElevations = useCallback(async () => {
    if (!client?.send || !convId) {
      setElevations([]);
      return;
    }
    setElevationsLoading(true);
    try {
      const result = (await client.send('anx.ai-agents.elevations.list', {
        conversationId: convId,
        status: ['active', 'pending'],
      })) as { responseObject?: ElevationRow[]; data?: ElevationRow[] };
      const list = result?.responseObject || result?.data || [];
      setElevations(Array.isArray(list) ? list : []);
    } catch {
      setElevations([]);
    } finally {
      setElevationsLoading(false);
    }
  }, [client, convId]);

  useEffect(() => {
    if (!open) return;
    void fetchDetails();
    void fetchElevations();
  }, [open, fetchDetails, fetchElevations]);

  if (!panel || !parts.length) return null;

  return (
    <>
      <div className="nexus-chat__strip">
        <button
          type="button"
          className="nexus-chat__chip nexus-chat__chip--clickable"
          onClick={() => setOpen(true)}
          title="Context & cost"
        >
          {parts.join(' · ')}
        </button>
      </div>
      {open ? (
        <div className="nexus-chat__sheet-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="nexus-chat__sheet nexus-chat__context-panel"
            role="dialog"
            aria-label="Context details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nexus-chat__sheet-header">
              <strong>Context</strong>
              <button type="button" className="nexus-chat__btn" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="nexus-chat__context-pct">
              <div className="nexus-chat__context-pct-value">{pct == null ? '—' : `${pct}%`}</div>
              <div className="nexus-chat__muted">{formatContextTokensLabel(tokensUsed, maxTokens)}</div>
              {costLabel ? <div>{costLabel}</div> : null}
            </div>

            {detailsLoading ? <p className="nexus-chat__muted">Loading context…</p> : null}
            {detailsError ? <p className="nexus-chat__error">{detailsError}</p> : null}

            {details?.toolCatalog ? (
              <section className="nexus-chat__context-section">
                <h4>Tool catalog</h4>
                <div className="nexus-chat__muted">
                  Active packs: {(details.toolCatalog.activePacks || []).length}
                </div>
                {(details.toolCatalog.activePacks || []).map((pack) => (
                  <div key={pack.name} className="nexus-chat__muted">
                    {pack.name}
                    {pack.toolCount != null ? ` · ${pack.toolCount} tools` : ''}
                  </div>
                ))}
              </section>
            ) : null}

            {details?.memory ? (
              <section className="nexus-chat__context-section">
                <h4>Memory</h4>
                <div className="nexus-chat__muted">
                  {details.memory.injectedTokens || 0} / {details.memory.budgetTokens ?? '∞'} tok
                </div>
              </section>
            ) : null}

            <section className="nexus-chat__context-section">
              <h4>Active permissions</h4>
              {elevationsLoading ? <div className="nexus-chat__muted">Loading…</div> : null}
              {!elevationsLoading && !elevations.length ? (
                <div className="nexus-chat__muted">None</div>
              ) : null}
              <ul className="nexus-chat__elevation-list">
                {elevations.map((el) => (
                  <li key={el.elevationId}>
                    <span>
                      {(el.packs || []).join(', ') || 'commands'} · {el.status || '—'}
                    </span>
                    {el.status === 'active' ? (
                      <button
                        type="button"
                        className="nexus-chat__btn"
                        disabled={revokingId === el.elevationId}
                        onClick={() => {
                          if (!client?.send) return;
                          setRevokingId(el.elevationId);
                          void client
                            .send('anx.ai-agents.elevations.revoke', { elevationId: el.elevationId })
                            .then(() => fetchElevations())
                            .catch((e) =>
                              setDetailsError(e instanceof Error ? e.message : 'Revoke failed'),
                            )
                            .finally(() => setRevokingId(null));
                        }}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <div className="nexus-chat__sheet-actions">
              <button
                type="button"
                className="nexus-chat__btn nexus-chat__btn--primary"
                disabled={!convId || compacting}
                onClick={() => {
                  if (!convId) return;
                  setCompacting(true);
                  setCompactError(null);
                  void chat
                    .compactConversation({ conversationId: convId })
                    .then(() => {
                      void fetchDetails();
                    })
                    .catch((e) => {
                      setCompactError(e instanceof Error ? e.message : 'Compact failed');
                    })
                    .finally(() => setCompacting(false));
                }}
              >
                {compacting ? 'Compacting…' : 'Compact'}
              </button>
              <button
                type="button"
                className="nexus-chat__btn"
                disabled={detailsLoading}
                onClick={() => {
                  void fetchDetails();
                  void fetchElevations();
                }}
              >
                Refresh context
              </button>
            </div>
            {compactError ? <p className="nexus-chat__error">{compactError}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
