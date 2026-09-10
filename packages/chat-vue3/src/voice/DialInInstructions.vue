<template>
  <div class="nexus-dial-in">
    <div v-if="loading" class="nexus-dial-in__muted">Loading dial-in options…</div>
    <div v-else-if="!numbers.length" class="nexus-dial-in__warn">
      {{ emptyText }}
    </div>
    <template v-else>
      <div v-if="countryOptions.length > 1" class="nexus-dial-in__row">
        <label class="nexus-dial-in__label">Prefer local number</label>
        <select
          class="nexus-dial-in__select"
          :value="selectedCountry || ''"
          @change="onCountry($event)"
        >
          <option value="">Auto (profile country)</option>
          <option v-for="c in countryOptions" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <p class="nexus-dial-in__note">{{ routingNote }}</p>
      <div class="nexus-dial-in__primary">
        <div class="nexus-dial-in__primary-head">
          <div>
            <div class="nexus-dial-in__country">
              {{ primary.countryCode || '—' }}
              <span v-if="primary.isPreferredCountry" class="nexus-dial-in__badge">(your country)</span>
            </div>
            <div class="nexus-dial-in__e164">{{ primary.phoneE164 }}</div>
          </div>
          <button type="button" class="nexus-dial-in__copy" @click="copy(primary.dialString || primary.phoneE164)">
            {{ copiedKey === (primary.dialString || primary.phoneE164) ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <code class="nexus-dial-in__dial">{{ primary.dialString || primary.phoneE164 }}</code>
        <p v-if="isOneTap(primary)" class="nexus-dial-in__hint">
          Commas (,,) pause after the platform number; # sends the access code.
          Example: +4944193168971,,7033449#
        </p>
        <div v-if="accessCode" class="nexus-dial-in__code">
          Routing code: <strong>{{ accessCode }}</strong>
        </div>
      </div>
      <button
        v-if="more.length"
        type="button"
        class="nexus-dial-in__more-btn"
        @click="moreOpen = !moreOpen"
      >
        {{ moreOpen ? 'Hide' : 'More countries' }} ({{ more.length }})
      </button>
      <ul v-if="moreOpen" class="nexus-dial-in__more">
        <li v-for="row in more" :key="row.phoneE164">
          <div class="nexus-dial-in__more-row">
            <span>{{ row.countryCode || '—' }} · {{ row.phoneE164 }}</span>
            <button type="button" class="nexus-dial-in__copy" @click="copy(row.dialString || row.phoneE164)">
              Copy
            </button>
          </div>
          <code class="nexus-dial-in__dial nexus-dial-in__dial--sm">{{ row.dialString || row.phoneE164 }}</code>
        </li>
      </ul>
    </template>
  </div>
</template>

<script>
export default {
  name: 'DialInInstructions',
  props: {
    dialIn: { type: Object, default: null },
    loading: { type: Boolean, default: false },
    selectedCountry: { type: String, default: null },
    emptyText: {
      type: String,
      default: 'No published phone numbers are available yet.',
    },
  },
  data() {
    return { moreOpen: false, copiedKey: null };
  },
  computed: {
    numbers() {
      const rows = this.dialIn?.numbers;
      return Array.isArray(rows) ? rows : [];
    },
    primary() {
      return this.numbers[0] || {};
    },
    more() {
      return this.numbers.slice(1);
    },
    countryOptions() {
      const codes = new Set();
      for (const row of this.numbers) {
        if (row.countryCode) codes.add(String(row.countryCode).toUpperCase());
      }
      if (this.dialIn?.preferredCountry) {
        codes.add(String(this.dialIn.preferredCountry).toUpperCase());
      }
      return [...codes].sort();
    },
    accessCode() {
      return (
        this.dialIn?.accessCode ||
        this.dialIn?.routingCode ||
        this.primary?.accessCode ||
        this.primary?.routingCode ||
        null
      );
    },
    routingNote() {
      const mode = this.dialIn?.routingMode;
      if (mode === 'agent_channel') {
        return 'Dial the platform number, then enter this agent’s access code when prompted.';
      }
      if (mode === 'contact_routing') {
        return 'Dial a platform number, then enter your personal routing code when prompted.';
      }
      if (mode === 'public_hotline') {
        return 'Dial a published platform hotline number to reach this agent.';
      }
      return 'Dial a platform number from your mobile or landline.';
    },
  },
  methods: {
    onCountry(ev) {
      const v = ev?.target?.value || '';
      this.$emit('country-change', v || null);
    },
    isOneTap(row) {
      const d = String(row?.dialString || '').trim();
      const e = String(row?.phoneE164 || '').trim();
      return d && d !== e && (d.includes(',,') || d.endsWith('#'));
    },
    async copy(text) {
      const value = String(text || '').trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        this.copiedKey = value;
        window.setTimeout(() => {
          if (this.copiedKey === value) this.copiedKey = null;
        }, 2000);
      } catch {
        /* ignore */
      }
    },
  },
};
</script>

<style scoped>
.nexus-dial-in__muted { font-size: 12px; color: #6c757d; }
.nexus-dial-in__warn { font-size: 12px; color: #c47d00; }
.nexus-dial-in__row { margin-bottom: 8px; }
.nexus-dial-in__label { display: block; font-size: 11px; color: #6c757d; margin-bottom: 2px; }
.nexus-dial-in__select { width: 100%; font-size: 13px; padding: 4px 6px; }
.nexus-dial-in__note { font-size: 12px; color: #495057; margin: 0 0 8px; }
.nexus-dial-in__primary {
  border: 1px solid #cce5ff;
  background: #f4f9ff;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.nexus-dial-in__primary-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.nexus-dial-in__country { font-size: 12px; color: #6c757d; }
.nexus-dial-in__badge { color: #28a745; }
.nexus-dial-in__e164 { font-weight: 600; font-size: 14px; }
.nexus-dial-in__dial {
  display: block;
  font-size: 11px;
  word-break: break-all;
  color: #1a4a8a;
}
.nexus-dial-in__dial--sm { font-size: 10px; margin-top: 4px; }
.nexus-dial-in__hint { font-size: 11px; color: #6c757d; margin: 6px 0 0; }
.nexus-dial-in__code { font-size: 12px; margin-top: 8px; }
.nexus-dial-in__copy {
  border: 1px solid #adb5bd;
  background: #fff;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.nexus-dial-in__more-btn {
  border: 0;
  background: transparent;
  color: #51cbce;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.nexus-dial-in__more { list-style: none; padding: 0; margin: 8px 0 0; }
.nexus-dial-in__more li {
  border-top: 1px solid #e9ecef;
  padding: 8px 0;
}
.nexus-dial-in__more-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
</style>
