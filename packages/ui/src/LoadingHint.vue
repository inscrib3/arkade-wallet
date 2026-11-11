<script setup lang="ts">
// A loading line with a spinner. Placed where a screen used a plain
// <p class="hint">, it keeps that screen's own hint styling.
defineProps<{ label?: string }>();
</script>

<template>
  <p class="hint" role="status">
    <span class="spinner" aria-hidden="true"></span>{{ label ?? 'Loading…' }}
  </p>
</template>

<style scoped>
.spinner {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  margin-right: 0.5em;
  vertical-align: -0.12em;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
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
