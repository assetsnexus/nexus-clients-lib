<template>
  <div v-if="visible" class="nexus-linked-subchat-banner" role="navigation" aria-label="Subagent conversation">
    <div class="nexus-linked-subchat-banner__row">
      <span class="nexus-linked-subchat-banner__badge">Subagent</span>
      <button
        v-if="parentConversationId"
        type="button"
        class="nexus-linked-subchat-banner__return"
        @click="$emit('open-parent', { parentConversationId, runId })"
      >
        ← Return to parent
      </button>
      <span class="nexus-linked-subchat-banner__parent" :title="parentDisplayName">
        {{ parentDisplayName }}
      </span>
      <span v-if="runId" class="nexus-linked-subchat-banner__meta text-muted">· {{ shortId }}</span>
    </div>
    <div v-if="showDelivery" class="nexus-linked-subchat-banner__delivery">
      <span class="nexus-linked-subchat-banner__delivery-label">Send as</span>
      <delivery-mode-picker :value="delivery" @input="$emit('update:delivery', $event)" />
    </div>
  </div>
</template>

<script>
import DeliveryModePicker from '../tools/DeliveryModePicker';

export default {
  name: 'NexusLinkedSubChatBanner',
  components: { DeliveryModePicker },
  props: {
    conversationRole: { type: String, default: null },
    parentConversationId: { type: String, default: null },
    parentTitle: { type: String, default: null },
    runId: { type: String, default: null },
    delivery: { type: String, default: 'queue' },
    showDelivery: { type: Boolean, default: true },
  },
  computed: {
    visible() {
      return this.conversationRole === 'subagent' || Boolean(this.parentConversationId);
    },
    parentDisplayName() {
      const title = String(this.parentTitle || '').trim();
      return title || 'Parent agent';
    },
    shortId() {
      const id = String(this.runId || '');
      return id.length > 10 ? `${id.slice(0, 8)}…` : id;
    },
  },
};
</script>
