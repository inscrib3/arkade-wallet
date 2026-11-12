<template>
  <span class="spinner" aria-hidden="true"></span>
</template>

<style scoped>
/* currentColor, so it stays visible on filled accent buttons too. */
.spinner {
  display: inline-block;
  flex-shrink: 0;
  width: 0.9em;
  height: 0.9em;
  vertical-align: -0.12em;
  border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2.4s; }
}
</style>
