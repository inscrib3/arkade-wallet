<script setup lang="ts">
import { ref } from 'vue';
import { useWalletClient } from '../wallet-client-key.js';

const emit = defineEmits<{ reset: [] }>();

const client = useWalletClient();

// Only clears the local VTXO/tx cache, never the seed. Two-step confirm.
const resetConfirming = ref(false);
const resetPassword = ref('');
const resetLoading = ref(false);
const resetError = ref('');

function startReset() {
  resetError.value = '';
  resetConfirming.value = true;
}

function cancelReset() {
  resetConfirming.value = false;
  resetPassword.value = '';
  resetError.value = '';
}

async function confirmReset() {
  if (!client.resetLocalCache) return;
  resetError.value = '';
  resetLoading.value = true;
  try {
    await client.resetLocalCache(resetPassword.value);
    emit('reset');
  } catch (e: unknown) {
    const msg = String(e);
    resetError.value = msg.includes('INCORRECT_PASSWORD')
      ? 'Incorrect password'
      : msg.includes('SERVER_UNREACHABLE')
        ? 'Could not reach the Ark server - try again'
        : msg;
  } finally {
    resetLoading.value = false;
    resetPassword.value = '';
  }
}
</script>

<template>
  <section class="settings-view">
    <template v-if="!resetConfirming">
      <button type="button" class="danger-outline" @click="startReset">Reset local cache</button>
      <p class="hint">Re-sync balance and history. Your seed is not affected.</p>
    </template>

    <template v-else>
      <p class="hint warning">
        Wipes this wallet's local VTXO/transaction cache and re-syncs from the Ark server. Your seed phrase is never touched - this can't lose funds, but any not-yet-synced local state is discarded.
      </p>
      <label>
        Password
        <input
          type="password"
          placeholder="Enter your password"
          v-model="resetPassword"
          @keydown.enter="confirmReset"
        />
      </label>
      <p v-if="resetError" class="error">{{ resetError }}</p>
      <button type="button" class="danger" @click="confirmReset" :disabled="resetLoading || !resetPassword">
        {{ resetLoading ? 'Resetting…' : 'Yes, wipe local cache and re-sync' }}
      </button>
      <button type="button" class="secondary" @click="cancelReset" :disabled="resetLoading">Cancel</button>
    </template>
  </section>
</template>
