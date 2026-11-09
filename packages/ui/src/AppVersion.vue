<script setup lang="ts">
// Set by the release workflow; any other build is a local one.
const releaseVersion: string | undefined = import.meta.env.VITE_APP_VERSION;
const label = releaseVersion ? `v${releaseVersion}` : 'dev build';
</script>

<template>
  <p class="version">{{ label }}</p>
</template>

<style scoped>
.version {
  margin-top: auto;
  align-self: center;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
}
</style>
