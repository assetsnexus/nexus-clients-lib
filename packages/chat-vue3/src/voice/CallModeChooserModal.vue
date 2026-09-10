<template>
  <div
    v-if="open"
    class="nexus-call-mode-modal"
    role="dialog"
    aria-modal="true"
    @click.self="$emit('close')"
  >
    <div class="nexus-call-mode-modal__shell">
      <div class="nexus-call-mode-modal__header">
        <h5 class="nexus-call-mode-modal__title">Choose call mode</h5>
        <button type="button" class="nexus-btn-link" aria-label="Close" @click="$emit('close')">×</button>
      </div>
      <p class="nexus-call-mode-modal__help">
        Choose browser realtime, dial-in on a platform number, or ring your verified phone.
      </p>
      <div v-if="loading" class="nexus-call-mode-modal__loading">Loading call options…</div>

      <!-- Browser -->
      <div class="nexus-mode-card nexus-mode-card--browser">
        <div class="nexus-mode-card__title">Browser voice</div>
        <p class="nexus-mode-card__desc">
          Talk in this browser tab with live transcription and tools — no phone line.
        </p>
        <button
          type="button"
          class="nexus-btn nexus-btn--block"
          :disabled="!browserEnabled"
          @click="choose('browser')"
        >
          Start in browser
        </button>
      </div>

      <!-- Inbound -->
      <div
        class="nexus-mode-card nexus-mode-card--inbound"
        :class="{ 'nexus-mode-card--dimmed': !inboundReady }"
      >
        <div class="nexus-mode-card__title">Inbound phone</div>
        <p class="nexus-mode-card__desc">{{ inboundDescription }}</p>
        <template v-if="inboundReady">
          <p class="nexus-mode-card__note">{{ inboundAccessNote }}</p>
          <DialInInstructions
            :dial-in="dialIn"
            :loading="loading"
            :selected-country="dialInCountry"
            @country-change="onDialInCountry"
          />
        </template>
        <template v-else>
          <p v-if="configureInboundHref && canConfigureAgent" class="nexus-mode-card__configure">
            <a :href="configureInboundHref" @click.prevent="goConfigure">Configure now</a>
            — enable inbound dial-in on the agent Channels tab.
          </p>
          <p v-else-if="!canConfigureAgent" class="nexus-mode-card__note">
            Ask an admin to enable dial-in for this agent.
          </p>
          <button type="button" class="nexus-btn nexus-btn--block" disabled>
            Dial-in number
          </button>
        </template>
      </div>

      <!-- Outbound -->
      <div
        class="nexus-mode-card nexus-mode-card--outbound"
        :class="{ 'nexus-mode-card--dimmed': Boolean(outboundDisabledReason) }"
      >
        <div class="nexus-mode-card__title">Outbound phone</div>
        <p class="nexus-mode-card__desc">
          {{ outboundDisabledReason || 'We ring your verified profile number; answer to talk to this agent.' }}
        </p>
        <p v-if="!outboundDisabledReason && phoneMasked" class="nexus-mode-card__note">
          Destination: <strong>{{ phoneMasked }}</strong>
        </p>
        <p v-if="outboundProfileHref && outboundNeedsPhone" class="nexus-mode-card__configure">
          <a :href="outboundProfileHref" @click.prevent="goProfile">Add and verify a phone number</a>
          in your profile.
        </p>
        <button
          type="button"
          class="nexus-btn nexus-btn--block nexus-btn--amber"
          :disabled="Boolean(outboundDisabledReason) || startingOutbound"
          @click="chooseOutbound"
        >
          {{ outboundCta }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import DialInInstructions from './DialInInstructions.vue';

export default {
  name: 'CallModeChooserModal',
  components: { DialInInstructions },
  props: {
    open: { type: Boolean, default: false },
    agentId: { type: String, default: null },
    /** Full dial-in-options payload from anx.agents.voice-channel.dial-in-options.get */
    dialIn: { type: Object, default: null },
    loading: { type: Boolean, default: false },
    loadError: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    phoneMasked: { type: String, default: null },
    /** Agent channel flags */
    inboundEnabled: { type: Boolean, default: false },
    outboundEnabled: { type: Boolean, default: true },
    browserEnabled: { type: Boolean, default: true },
    canConfigureAgent: { type: Boolean, default: false },
    configureInboundHref: { type: String, default: null },
    outboundProfileHref: { type: String, default: '/user/profile' },
    startingOutbound: { type: Boolean, default: false },
    /** @deprecated thin-button labels kept for compat */
    titleText: { type: String, default: 'Choose call mode' },
    helpText: { type: String, default: '' },
    browserLabel: { type: String, default: '' },
    inboundLabel: { type: String, default: '' },
    outboundLabel: { type: String, default: '' },
  },
  data() {
    return { dialInCountry: null };
  },
  computed: {
    phoneState() {
      if (this.loading) return 'loading';
      if (this.loadError) return 'down';
      const platform = this.dialIn?.platform;
      if (platform) {
        if (platform.featureEnabled === false) return 'feature_off';
        if (platform.configured === false) return 'not_configured';
        if (platform.publishedNumberCount === 0) return 'no_numbers';
      }
      const numbers = this.dialIn?.numbers;
      if (!Array.isArray(numbers) || numbers.length === 0) {
        if (!this.inboundEnabled) return 'not_configured';
        return 'no_numbers';
      }
      return 'ok';
    },
    inboundReady() {
      return this.inboundEnabled && this.phoneState === 'ok';
    },
    inboundDescription() {
      if (this.inboundReady) return 'Dial a platform number from your mobile or landline.';
      if (this.phoneState === 'down') {
        return 'Phone calling is temporarily unavailable (service offline). Please try again later.';
      }
      if (this.phoneState === 'feature_off') {
        return this.dialIn?.platform?.disabledMessage || 'Phone calling is currently disabled.';
      }
      if (!this.inboundEnabled) {
        return 'Inbound dial-in is not enabled for this agent yet.';
      }
      if (this.phoneState === 'no_numbers') {
        return 'No published phone numbers are available yet. Ask an admin to add platform numbers.';
      }
      return 'Phone dial-in is not set up on this platform yet.';
    },
    inboundAccessNote() {
      const masked = this.dialIn?.verifiedCallerPhoneMasked || this.phoneMasked;
      if (masked) {
        return `Only calls from your verified number (${masked}) are accepted for this agent unless a public hotline is configured.`;
      }
      return 'Verify your profile phone so the platform can accept your inbound calls.';
    },
    outboundNeedsPhone() {
      return !this.phoneVerified || !this.phoneMasked;
    },
    outboundDisabledReason() {
      if (!this.outboundEnabled) return 'Outbound calling is disabled for this agent.';
      if (this.phoneState === 'down' || this.phoneState === 'feature_off') {
        return this.inboundDescription;
      }
      if (this.dialIn && this.dialIn.outboundAvailable === false && this.dialIn.outboundUnavailableReason) {
        return this.dialIn.outboundUnavailableReason;
      }
      if (!this.phoneVerified || !this.phoneMasked) {
        return 'Add and verify a phone number in your profile to receive the outbound call.';
      }
      return null;
    },
    outboundCta() {
      if (this.startingOutbound) return 'Starting…';
      if (this.phoneMasked) return `Ring ${this.phoneMasked}`;
      return 'Ring my phone';
    },
  },
  watch: {
    open(v) {
      if (v) this.dialInCountry = null;
    },
  },
  methods: {
    onDialInCountry(code) {
      this.dialInCountry = code;
      this.$emit('dial-in-country-change', code);
    },
    choose(mode) {
      this.$emit('choose', { mode, agentId: this.agentId });
      if (mode !== 'inbound') this.$emit('close');
    },
    chooseOutbound() {
      if (this.outboundDisabledReason) return;
      this.choose('outbound');
    },
    goConfigure() {
      this.$emit('configure-inbound');
      if (this.configureInboundHref) {
        try {
          this.$router?.push?.(this.configureInboundHref);
        } catch {
          window.location.assign(this.configureInboundHref);
        }
      }
    },
    goProfile() {
      this.$emit('configure-profile-phone');
      if (this.outboundProfileHref) {
        try {
          this.$router?.push?.(this.outboundProfileHref);
        } catch {
          window.location.assign(this.outboundProfileHref);
        }
      }
    },
  },
};
</script>

<style scoped>
.nexus-call-mode-modal {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.nexus-call-mode-modal__shell {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
  padding: 16px;
}
.nexus-call-mode-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.nexus-call-mode-modal__title {
  margin: 0;
  font-size: 17px;
}
.nexus-call-mode-modal__help {
  font-size: 13px;
  color: #6c757d;
  margin: 0 0 12px;
}
.nexus-call-mode-modal__loading {
  font-size: 12px;
  color: #6c757d;
  margin-bottom: 8px;
}
.nexus-mode-card {
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid #e9ecef;
}
.nexus-mode-card--browser { border-color: #b7e4c7; background: #f3fbf6; }
.nexus-mode-card--inbound { border-color: #b6d4fe; background: #f4f8ff; }
.nexus-mode-card--outbound { border-color: #ffe0a8; background: #fffaf0; }
.nexus-mode-card--dimmed { opacity: 0.72; }
.nexus-mode-card__title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.nexus-mode-card__desc { font-size: 12px; color: #495057; margin: 0 0 8px; }
.nexus-mode-card__note { font-size: 11px; color: #6c757d; margin: 0 0 8px; }
.nexus-mode-card__configure { font-size: 12px; margin: 0 0 8px; }
.nexus-mode-card__configure a { color: #0d6efd; }
.nexus-btn {
  border: 1px solid #51cbce;
  background: #fff;
  color: #51cbce;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}
.nexus-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.nexus-btn--block { display: block; width: 100%; }
.nexus-btn--amber { border-color: #e0a800; color: #9a7200; }
.nexus-btn-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 0;
}
</style>
