<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { CHROME_WEB_STORE_URL, readBrowserFacts, rememberDismissed, shouldOfferExtension } from './extension-offer.js';

const visible = ref(false);

// index.html makes room for the fixed banner so it never covers the card.
watch(visible, (shown) => document.body.classList.toggle('has-top-banner', shown));

function evaluate() {
  visible.value = shouldOfferExtension(readBrowserFacts());
}

onMounted(() => {
  if (document.readyState === 'complete') evaluate();
  else window.addEventListener('load', evaluate, { once: true });
});

function dismiss() {
  rememberDismissed();
  visible.value = false;
}
</script>

<template>
  <div v-if="visible" class="extension-banner">
    <span>Get the browser extension to connect to dApps.</span>
    <div class="actions">
      <a class="install-btn" :href="CHROME_WEB_STORE_URL" target="_blank" rel="noopener noreferrer">Install</a>
      <button type="button" class="dismiss-btn" @click="dismiss" aria-label="Dismiss">✕</button>
    </div>
  </div>
</template>

<style scoped>
.extension-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-accent);
  padding: 8px 16px;
  font-size: 13px;
  color: var(--color-text);
}
.actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.install-btn {
  background: var(--color-accent);
  color: var(--color-accent-text);
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.dismiss-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
}
</style>
