<script setup lang="ts">
import type { TxHistoryEntry } from '@inscrib3/core';
import { isAwaitingOnchainConfirmation } from './format.js';

defineProps<{ tx: Pick<TxHistoryEntry, 'status' | 'layer'> }>();
</script>

<template>
  <span v-if="isAwaitingOnchainConfirmation(tx)" class="tx-status">Pending</span>
</template>

<style scoped>
.tx-status { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; background: #1f1a0d; color: #e0a030; }
</style>
