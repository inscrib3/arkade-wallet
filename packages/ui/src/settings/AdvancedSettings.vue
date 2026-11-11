<script setup lang="ts">
import { ref } from 'vue';
import { useWalletClient } from '../wallet-client-key.js';

const emit = defineEmits<{ reset: [] }>();

const client = useWalletClient();

type ResetAction = 'cache' | 'wallet';

const action = ref<ResetAction | null>(null);
const password = ref('');
const loading = ref(false);
const error = ref('');

function startReset(nextAction: ResetAction) {
  error.value = '';
  action.value = nextAction;
}

function cancelReset() {
  action.value = null;
  password.value = '';
  error.value = '';
}

async function confirmReset() {
  if (!action.value) return;
  error.value = '';
  loading.value = true;
  try {
    if (action.value === 'wallet') {
      await client.resetWallet(password.value);
    } else if (client.resetLocalCache) {
      await client.resetLocalCache(password.value);
      emit('reset');
    }
  } catch (e: unknown) {
    const msg = String(e);
    error.value = msg.includes('INCORRECT_PASSWORD')
      ? 'Incorrect password'
      : msg.includes('SERVER_UNREACHABLE')
        ? 'Could not reach the Arkade Operator - try again'
        : msg;
  } finally {
    loading.value = false;
    password.value = '';
  }
}
</script>

<template>
  <section class="settings-view">
    <template v-if="!action">
      <div class="action-card">
        <h3>Local data</h3>
        <p class="hint">Clear cached transactions and re-sync your balance and history. Your seed phrase is not affected.</p>
        <button type="button" class="secondary" @click="startReset('cache')">Reset local cache</button>
      </div>

      <div class="action-card danger-zone">
        <h3>Reset wallet</h3>
        <p class="hint warning">
          Permanently remove every seed phrase, account, setting and cache from this device. You can recover funds only with your seed phrase backup.
        </p>
        <button type="button" class="danger-outline" @click="startReset('wallet')">Reset wallet</button>
      </div>
    </template>

    <template v-else>
      <p class="hint warning">
        <template v-if="action === 'wallet'">
          This deletes the wallet and all its local data from this device. This action cannot be undone. Make sure every seed phrase is backed up before continuing.
        </template>
        <template v-else>
          This wipes the local transaction cache and re-syncs from the Arkade Operator. Your seed phrase is not affected.
        </template>
      </p>
      <label>
        Password
        <input
          type="password"
          placeholder="Enter your password"
          v-model="password"
          @keydown.enter="confirmReset"
          autofocus
        />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="button" class="danger" @click="confirmReset" :disabled="loading || !password">
        {{ loading ? 'Resetting…' : action === 'wallet' ? 'Delete everything and reset' : 'Reset cache and re-sync' }}
      </button>
      <button type="button" class="secondary" @click="cancelReset" :disabled="loading">Cancel</button>
    </template>
  </section>
</template>

<style scoped>
.action-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}
.action-card h3 { font-size: 14px; color: var(--color-text); }
.danger-zone { border-color: rgba(255, 107, 107, 0.4); }
</style>
