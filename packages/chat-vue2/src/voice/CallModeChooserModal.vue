<template>
  <div
    v-if="open"
    class="nexus-call-mode-modal"
    role="dialog"
    aria-modal="true"
    @click.self="$emit('close')"
  >
    <div class="nexus-call-mode-modal__card">
      <div class="nexus-call-mode-modal__header">
        <h5 class="nexus-call-mode-modal__title">{{ titleText }}</h5>
        <button type="button" class="nexus-btn-link" aria-label="Close" @click="$emit('close')">×</button>
      </div>
      <p class="nexus-call-mode-modal__help">{{ helpText }}</p>
      <button type="button" class="nexus-btn nexus-btn--block" @click="choose('browser')">
        {{ browserLabel }}
      </button>
      <button type="button" class="nexus-btn nexus-btn--block" @click="choose('inbound')">
        {{ inboundLabel }}
      </button>
      <button type="button" class="nexus-btn nexus-btn--block" @click="choose('outbound')">
        {{ outboundLabel }}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CallModeChooserModal',
  props: {
    open: { type: Boolean, default: false },
    agentId: { type: String, default: null },
    titleText: { type: String, default: 'Start a voice call' },
    helpText: {
      type: String,
      default: 'Choose browser realtime, dial-in, or outbound phone.',
    },
    browserLabel: { type: String, default: 'Browser (microphone)' },
    inboundLabel: { type: String, default: 'Dial-in number' },
    outboundLabel: { type: String, default: 'Call my phone' },
  },
  methods: {
    choose(mode) {
      this.$emit('choose', { mode, agentId: this.agentId });
      this.$emit('close');
    },
  },
};
</script>

<style scoped>
.nexus-call-mode-modal {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.nexus-call-mode-modal__card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  padding: 16px;
}
.nexus-call-mode-modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.nexus-call-mode-modal__title {
  margin: 0;
  font-size: 16px;
}
.nexus-call-mode-modal__help {
  font-size: 13px;
  color: #6c757d;
  margin: 0 0 12px;
}
.nexus-btn {
  border: 1px solid #51cbce;
  background: #fff;
  color: #51cbce;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 8px;
}
.nexus-btn--block {
  display: block;
  width: 100%;
}
.nexus-btn-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 0;
}
</style>
