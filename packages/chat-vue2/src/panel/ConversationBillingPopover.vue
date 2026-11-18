<template>
  <div v-if="open" class="nexus-billing-popover" role="dialog" :aria-label="L.billingTitle">
    <div class="nexus-billing-popover__backdrop" @click="$emit('close')" />
    <div class="nexus-billing-popover__card">
      <div class="nexus-billing-popover__header">
        <strong>{{ L.billingTitle }}</strong>
        <button type="button" class="nexus-btn-link" @click="$emit('close')">{{ L.billingClose }}</button>
      </div>

      <div class="nexus-billing-popover__split">
        <div class="nexus-billing-popover__billing">
          <div v-if="loading" class="nexus-muted">{{ L.billingLoading }}</div>
          <div v-else-if="error" class="nexus-billing-popover__error">{{ error }}</div>
          <template v-else>
            <div class="nexus-billing-popover__row">
              <span>{{ L.billingMode }}</span>
              <span>{{ modeLabel }}</span>
            </div>
            <div class="nexus-billing-popover__row">
              <span>{{ L.billingTokens }}</span>
              <span>{{ tokensLabel }}</span>
            </div>
            <div class="nexus-billing-popover__row">
              <span>{{ trackedLabel }}</span>
              <span>{{ trackedFormatted }}</span>
            </div>
            <div class="nexus-billing-popover__row">
              <span>{{ L.billingCreditsCharged }}</span>
              <span>{{ creditsFormatted }}</span>
            </div>
            <div v-if="isByok" class="nexus-muted nexus-billing-popover__hint">
              {{ L.billingByokHint }}
            </div>
            <div v-if="turns.length" class="nexus-billing-popover__turns">
              <div class="nexus-billing-popover__turns-title">{{ L.billingRecentTurns }}</div>
              <div v-for="(t, i) in turns" :key="i" class="nexus-billing-popover__turn">
                <span>{{ formatTurnAt(t.at) }}</span>
                <span>{{ turnKindLabel(t) }}</span>
                <span>{{ formatTurnCost(t) }}</span>
              </div>
            </div>
            <div v-else class="nexus-muted nexus-billing-popover__hint">
              {{ L.billingEmptyTurns }}
            </div>
            <button
              v-if="showCostDashboardLink"
              type="button"
              class="nexus-btn nexus-btn--block"
              @click="$emit('open-cost-dashboard')"
            >
              {{ L.billingOpenDashboard }}
            </button>
          </template>
        </div>

        <div class="nexus-billing-popover__context">
          <button
            type="button"
            class="nexus-billing-popover__context-btn"
            :title="L.usageDetails"
            @click="$emit('open-context')"
          >
            <div class="nexus-billing-popover__donut-wrap" aria-hidden="true">
              <svg viewBox="0 0 42 42" class="nexus-billing-popover__donut">
                <circle class="nexus-billing-popover__donut-ring" cx="21" cy="21" r="15.915" />
                <circle
                  class="nexus-billing-popover__donut-fill"
                  cx="21"
                  cy="21"
                  r="15.915"
                  :stroke-dasharray="donutDash"
                  stroke-dashoffset="25"
                />
              </svg>
              <div class="nexus-billing-popover__donut-center">
                <div class="nexus-billing-popover__donut-pct">
                  {{ usageBars.contextPct == null ? '—' : usageBars.contextPct + '%' }}
                </div>
                <div class="nexus-billing-popover__donut-sub">{{ L.usageContext }}</div>
              </div>
            </div>

            <div
              v-if="usageBars.contextPct != null"
              class="nexus-billing-popover__bar"
            >
              <span class="nexus-billing-popover__bar-label">{{ L.usageContext }}</span>
              <span
                class="nexus-billing-popover__bar-track"
                role="progressbar"
                :aria-valuenow="usageBars.contextPct"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="L.usageContextHint"
              >
                <span
                  class="nexus-billing-popover__bar-fill"
                  :style="{ width: usageBars.contextPct + '%' }"
                />
              </span>
              <span class="nexus-billing-popover__bar-value">{{ usageBars.contextPct }}%</span>
            </div>
            <div
              v-if="usageBars.cachePct != null"
              class="nexus-billing-popover__bar"
            >
              <span class="nexus-billing-popover__bar-label">{{ L.usageCache }}</span>
              <span
                class="nexus-billing-popover__bar-track"
                role="progressbar"
                :aria-valuenow="usageBars.cachePct"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="L.usageCacheHint"
              >
                <span
                  class="nexus-billing-popover__bar-fill nexus-billing-popover__bar-fill--cache"
                  :style="{ width: usageBars.cachePct + '%' }"
                />
              </span>
              <span class="nexus-billing-popover__bar-value">{{ usageBars.cacheLabel }}</span>
            </div>
            <div v-if="!usageBars.hasAny" class="nexus-muted nexus-billing-popover__hint">
              {{ L.usageEmpty }}
            </div>
            <div class="nexus-billing-popover__context-hint">{{ usageBars.contextLabel }}</div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { usageBarModel } from '@nexus/chat-core';
import { DEFAULT_PANEL_LABELS, formatMicroUsd, formatMoneyMinor, spendLabelForCurrency } from './labels';

function unwrapData(result) {
  if (!result || typeof result !== 'object') return {};
  if (result.data && typeof result.data === 'object') return result.data;
  if (result.responseObject && typeof result.responseObject === 'object') return result.responseObject;
  return result;
}

function interpolate(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) =>
    values && values[key] != null ? String(values[key]) : '',
  );
}

export default {
  name: 'ConversationBillingPopover',
  props: {
    open: { type: Boolean, default: false },
    commandClient: { type: Object, default: null },
    conversationId: { type: String, default: null },
    /** Fallback from live panel usage while fetch is pending. */
    usage: { type: Object, default: null },
    showCostDashboardLink: { type: Boolean, default: true },
    labels: { type: Object, default: null },
  },
  data() {
    return {
      loading: false,
      error: null,
      billing: null,
    };
  },
  computed: {
    L() {
      return { ...DEFAULT_PANEL_LABELS, ...(this.labels || {}) };
    },
    usageBars() {
      return usageBarModel(this.usage || null);
    },
    donutDash() {
      const pct = this.usageBars.contextPct == null ? 0 : this.usageBars.contextPct;
      return `${pct} ${100 - pct}`;
    },
    isByok() {
      const mode = (this.billing && this.billing.billingMode) || (this.usage && this.usage.billingMode);
      return mode === 'byok';
    },
    modeLabel() {
      const mode = (this.billing && this.billing.billingMode) || (this.usage && this.usage.billingMode) || '—';
      if (mode === 'byok') return this.L.billingModeByok;
      if (mode === 'credits') return this.L.billingModeCredits;
      if (mode === 'admin_waived') return this.L.billingModeWaived;
      if (mode === 'free') return this.L.billingModeFree;
      return String(mode);
    },
    displayCurrency() {
      return (
        (this.billing && this.billing.displayCurrency) ||
        (this.usage && this.usage.displayCurrency) ||
        null
      );
    },
    trackedLabel() {
      if (this.isByok || this.displayCurrency) {
        return interpolate(this.L.billingTracked, {
          label: spendLabelForCurrency(this.displayCurrency, {
            cost: this.L.cost,
            credits: this.L.credits,
          }),
        });
      }
      return this.L.billingTrackedSpend;
    },
    trackedFormatted() {
      const minor =
        this.billing && this.billing.trackedCostMinor != null
          ? this.billing.trackedCostMinor
          : this.usage &&
              (this.usage.displayCostMinor != null
                ? this.usage.displayCostMinor
                : this.usage.costCents);
      if (minor == null) return '—';
      return formatMoneyMinor(minor, this.displayCurrency);
    },
    creditsFormatted() {
      const cents =
        this.billing && this.billing.creditsChargedCents != null
          ? this.billing.creditsChargedCents
          : this.usage && this.usage.creditsChargedCents != null
            ? this.usage.creditsChargedCents
            : this.isByok
              ? 0
              : null;
      if (cents == null) return '—';
      return formatMoneyMinor(cents, null);
    },
    tokensLabel() {
      const usage = this.usage || {};
      const used = usage.tokensUsed;
      const max = usage.maxContextTokens;
      if (used == null) return '—';
      return max != null ? `${used} / ${max} tok` : `${used} tok`;
    },
    turns() {
      const list =
        (this.billing && (this.billing.lastTurns || this.billing.last5Turns)) || [];
      return Array.isArray(list) ? list : [];
    },
  },
  watch: {
    open: {
      immediate: true,
      handler(val) {
        if (val) void this.load();
      },
    },
    conversationId() {
      if (this.open) void this.load();
    },
  },
  methods: {
    async load() {
      if (!this.open || !this.conversationId || !this.commandClient) {
        this.billing = null;
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        const result = await this.commandClient.send(
          'anx.communicate.conversations.billing.get',
          { conversationId: this.conversationId },
        );
        if (result && typeof result === 'object' && result.ok === false) {
          throw new Error(result.message || 'Failed to load billing');
        }
        this.billing = unwrapData(result);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        this.billing = null;
      } finally {
        this.loading = false;
      }
    },
    formatTurnAt(at) {
      if (!at) return '';
      const d = new Date(at);
      if (Number.isNaN(d.getTime())) return String(at);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    },
    actionLabel(action) {
      const a = String(action || '');
      if (a === 'chat_reader') return 'Chat';
      if (a === 'chat_compact') return 'Compact';
      return a || 'Turn';
    },
    /**
     * Prefer the budget bucket (normal chat / warm follow-up / automation) so
     * the user can tell a conversational follow-up or a background compaction
     * apart from a turn they actually sent. Falls back to the action label for
     * older rows that carry no usageClass.
     */
    turnKindLabel(turn) {
      const cls = turn && turn.usageClass;
      if (cls === 'warm') return 'Follow-up';
      if (cls === 'automation') {
        const role = turn && turn.automationRole;
        return role ? `Automation: ${role}` : 'Automation';
      }
      return this.actionLabel(turn && turn.action);
    },
    formatTurnCost(t) {
      const tracked = t.trackedMinor != null ? t.trackedMinor : t.creditsCents;
      const charged = t.creditsCents;
      // A turn whose COGS is a fraction of a cent rounds to 0 minor units and
      // would print "€0.00". Prefer the raw provider COGS (micro-USD) for those
      // so the price shows real sub-cent precision.
      const money =
        (tracked == null || tracked === 0) &&
        t.trackedMicroUsd != null &&
        t.trackedMicroUsd > 0
          ? formatMicroUsd(t.trackedMicroUsd, this.displayCurrency)
          : formatMoneyMinor(tracked, this.displayCurrency);
      if (this.isByok) return money;
      if (charged != null && charged !== tracked) {
        return `${money} (${formatMoneyMinor(charged, null)} cr)`;
      }
      return money;
    },
  },
};
</script>

<style scoped>
.nexus-billing-popover {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 12px 12px;
  pointer-events: none;
}
.nexus-billing-popover__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}
.nexus-billing-popover__card {
  position: relative;
  pointer-events: auto;
  width: min(720px, 100%);
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  padding: 12px;
  color: #66615b;
  font-size: 12px;
}
.nexus-billing-popover__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.nexus-billing-popover__split {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
  gap: 14px;
  align-items: start;
}
.nexus-billing-popover__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.nexus-billing-popover__hint {
  margin: 8px 0;
  font-size: 11px;
}
.nexus-billing-popover__error {
  color: #ef8157;
}
.nexus-billing-popover__turns {
  margin: 10px 0;
  border-top: 1px solid #e9ecef;
  padding-top: 8px;
}
.nexus-billing-popover__turns-title {
  font-weight: 700;
  margin-bottom: 6px;
}
.nexus-billing-popover__turn {
  display: grid;
  grid-template-columns: 1.2fr 0.7fr 0.9fr;
  gap: 4px;
  font-size: 11px;
  margin-bottom: 4px;
}
.nexus-billing-popover__context {
  border-left: 1px solid #eef1f4;
  padding-left: 12px;
}
.nexus-billing-popover__context-btn {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.nexus-billing-popover__donut-wrap {
  position: relative;
  width: 110px;
  height: 110px;
  margin: 0 auto 10px;
}
.nexus-billing-popover__donut {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.nexus-billing-popover__donut-ring {
  fill: none;
  stroke: #eef1f4;
  stroke-width: 3;
}
.nexus-billing-popover__donut-fill {
  fill: none;
  stroke: #51cbce;
  stroke-width: 3;
}
.nexus-billing-popover__donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.nexus-billing-popover__donut-pct {
  font-weight: 700;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.nexus-billing-popover__donut-sub {
  font-size: 10px;
  color: #6c757d;
}
.nexus-billing-popover__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-variant-numeric: tabular-nums;
}
.nexus-billing-popover__bar-label {
  width: 48px;
  color: #6c757d;
  flex-shrink: 0;
}
.nexus-billing-popover__bar-track {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: #eef1f4;
  overflow: hidden;
}
.nexus-billing-popover__bar-fill {
  display: block;
  height: 100%;
  background: #51cbce;
}
.nexus-billing-popover__bar-fill--cache {
  background: #6bd098;
}
.nexus-billing-popover__bar-value {
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}
.nexus-billing-popover__context-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #6c757d;
  text-align: center;
}
.nexus-btn--block {
  width: 100%;
  margin-top: 8px;
}
@media (max-width: 576px) {
  .nexus-billing-popover__card {
    width: min(100%, 100%);
  }
  .nexus-billing-popover__split {
    grid-template-columns: 1fr;
  }
  .nexus-billing-popover__context {
    border-left: none;
    border-top: 1px solid #eef1f4;
    padding-left: 0;
    padding-top: 12px;
  }
}
</style>
