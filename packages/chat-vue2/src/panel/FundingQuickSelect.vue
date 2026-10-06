<template>
  <section v-if="visible" class="nexus-funding-quick" role="dialog" aria-label="How this chat is paid">
    <p v-if="model.meter" class="nexus-funding-quick__meter">{{ model.meter }}</p>
    <p v-if="model.switchMessage" class="nexus-funding-quick__switch">{{ model.switchMessage }}</p>
    <p v-if="gate && gate.phase === 'denied'" class="nexus-funding-quick__switch">{{ gate.reason || 'This agent is not available.' }}</p>
    <p v-if="model.marginLabel" class="nexus-funding-quick__meter">{{ model.marginLabel }}</p>
    <p v-for="gap in model.modalityGaps" :key="gap" class="nexus-funding-quick__gap">{{ gap }}</p>
    <div class="nexus-funding-quick__actions">
      <button v-if="model.showByo" type="button" :disabled="busy" @click="$emit('select-funding', 'byo')">Use my subscription</button>
      <button v-if="model.showByo" type="button" :disabled="busy" @click="$emit('byok')">Add my own key</button>
      <button v-if="model.showResale" type="button" :disabled="busy" @click="$emit('select-funding', 'owner_resale')">Buy a pass</button>
    </div>
    <p v-for="row in model.resalePrices" :key="row.modality" class="nexus-funding-quick__gap">{{ row.label }}</p>
    <guest-continue :presentation="continuePresentation" />
  </section>
</template>

<script>
import { fundingQuickSelectModel, guestContinuePresentation, initialFundingGate } from '@nexus/chat-core';
import GuestContinue from './GuestContinue.vue';

export default {
  name: 'FundingQuickSelect',
  components: { GuestContinue },
  props: {
    gate: { type: Object, default: null },
    currencyExponent: { type: Number, default: 2 },
    busy: { type: Boolean, default: false },
    surface: { type: String, default: 'browser' },
  },
  computed: {
    model() {
      return fundingQuickSelectModel(this.gate || initialFundingGate(), this.currencyExponent);
    },
    continuePresentation() {
      const gate = this.gate || initialFundingGate();
      return guestContinuePresentation({
        outcome: gate.phase === 'login_required' ? 'login_required' : 'chat',
        loginUrl: gate.loginUrl,
        surface: this.surface === 'kiosk' ? 'kiosk' : 'browser',
      });
    },
    visible() {
      return this.model.visible || (this.gate && (this.gate.phase === 'denied' || this.gate.phase === 'login_required'));
    },
  },
};
</script>
