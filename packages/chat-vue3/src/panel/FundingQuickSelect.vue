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
  </section>
</template>

<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import { fundingQuickSelectModel, initialFundingGate, type FundingGateState } from '@nexus/chat-core';

export default defineComponent({
  name: 'FundingQuickSelect',
  props: {
    gate: { type: Object as PropType<FundingGateState | null>, default: null },
    currencyExponent: { type: Number, default: 2 },
    busy: { type: Boolean, default: false },
  },
  emits: ['select-funding', 'byok'],
  setup(props) {
    const model = computed(() => fundingQuickSelectModel(props.gate || initialFundingGate(), props.currencyExponent));
    const visible = computed(() => model.value.visible || props.gate?.phase === 'denied');
    return { model, visible };
  },
});
</script>
