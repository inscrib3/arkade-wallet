<script setup lang="ts">
// Button content that shows a spinner while its action runs, so a slow
// server round-trip never looks like a frozen wallet.
import Spinner from './Spinner.vue';

defineProps<{ busy: boolean; busyText: string }>();
</script>

<template>
  <span v-if="busy" class="busy" role="status"><Spinner />{{ busyText }}</span>
  <slot v-else />
</template>

<style scoped>
.busy { display: inline-flex; align-items: center; justify-content: center; gap: 0.5em; }
</style>
