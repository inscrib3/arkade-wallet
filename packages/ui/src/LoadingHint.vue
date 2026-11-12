<script setup lang="ts">
// A loading line with a spinner. Placed where a screen used a plain
// <p class="hint">, it keeps that screen's own hint styling.
import Spinner from './Spinner.vue';

defineProps<{ label?: string }>();
</script>

<template>
  <p class="hint" role="status">
    <Spinner class="accent" />{{ label ?? 'Loading…' }}
  </p>
</template>

<style scoped>
.accent { margin-right: 0.5em; color: var(--color-accent); }
</style>
