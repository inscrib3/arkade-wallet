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
  <div v-if="visible" class="extension-banner" role="region" aria-label="Browser extension">
    <div class="banner-content">
      <div class="extension-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M9.5 4.5h-5v15h15v-5" />
          <path d="M14.5 4.5h5v5" />
          <path d="m11 13 8-8" />
        </svg>
      </div>

      <div class="copy">
        <strong>Connect to apps, right from your browser</strong>
        <span>Get faster access with the Inscrib3 extension.</span>
      </div>

      <a class="install-btn" :href="CHROME_WEB_STORE_URL" target="_blank" rel="noopener noreferrer">
        Get the extension
        <span aria-hidden="true">→</span>
      </a>

      <button type="button" class="dismiss-btn" @click="dismiss" aria-label="Dismiss extension offer">✕</button>
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
  min-height: 72px;
  padding: 10px 48px 10px 20px;
  overflow: hidden;
  color: var(--color-text);
  background:
    radial-gradient(circle at 18% -80%, rgba(124, 251, 158, 0.2), transparent 48%),
    linear-gradient(110deg, #171322 0%, #111111 55%, #141c16 100%);
  border-bottom: 1px solid rgba(124, 251, 158, 0.42);
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.38);
}
.banner-content {
  width: min(920px, 100%);
  min-height: 51px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
}
.extension-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(124, 251, 158, 0.35);
  border-radius: 13px;
  color: var(--color-accent);
  background: rgba(124, 251, 158, 0.1);
  box-shadow: inset 0 0 18px rgba(124, 251, 158, 0.05);
}
.extension-icon svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.copy strong {
  font-size: 15px;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.copy span {
  color: #aaa4b5;
  font-size: 12px;
  line-height: 1.3;
}
.install-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #92ffad, var(--color-accent));
  color: var(--color-accent-text);
  border-radius: 10px;
  padding: 10px 15px;
  font-size: 13px;
  font-weight: 750;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 6px 22px rgba(124, 251, 158, 0.2);
  transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
}
.install-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 8px 28px rgba(124, 251, 158, 0.3);
}
.install-btn:focus-visible,
.dismiss-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.dismiss-btn {
  position: absolute;
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 8px;
  border-radius: 8px;
  transition: color 150ms ease, background 150ms ease;
}
.dismiss-btn:hover {
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.06);
}

@media (max-width: 560px) {
  .extension-banner {
    min-height: 88px;
    padding: 12px 42px 12px 14px;
  }
  .banner-content { gap: 10px; }
  .extension-icon {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
    border-radius: 11px;
  }
  .copy strong { font-size: 13px; }
  .copy span { display: none; }
  .install-btn {
    padding: 9px 11px;
    font-size: 12px;
  }
  .install-btn span { display: none; }
  .dismiss-btn { right: 7px; }
}
</style>
