<template>
  <div class="nexus-guest-continue">
    <a v-if="presentation && presentation.kind === 'link'" class="nexus-guest-continue__link" :href="presentation.url">Log in to continue this chat</a>
    <div v-else-if="presentation && presentation.kind === 'qr'" class="nexus-guest-continue__qr">
      <img v-if="dataUrl" :src="dataUrl" width="240" height="240" alt="QR code that opens the login page so this chat can continue" />
      <p v-else class="nexus-guest-continue__hint">Preparing the login code…</p>
      <p class="nexus-guest-continue__hint">Scan to log in and continue this chat</p>
    </div>
  </div>
</template>

<script>
import QRCode from 'qrcode';

export default {
  name: 'GuestContinue',
  props: {
    presentation: { type: Object, required: true },
  },
  data() {
    return { dataUrl: '' };
  },
  watch: {
    presentation: {
      immediate: true,
      deep: true,
      handler() {
        this.draw();
      },
    },
  },
  methods: {
    async draw() {
      this.dataUrl = '';
      if (!this.presentation || this.presentation.kind !== 'qr' || !this.presentation.url) return;
      try {
        this.dataUrl = await QRCode.toDataURL(this.presentation.url, {
          margin: 1,
          width: 240,
          errorCorrectionLevel: 'M',
        });
      } catch (err) {
        console.warn('[GuestContinue] QR code failed', err && err.message);
      }
    },
  },
};
</script>
