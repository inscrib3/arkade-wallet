<script setup lang="ts">
import BusyLabel from './BusyLabel.vue';
import { ref } from 'vue';
import { useWalletClient } from './wallet-client-key.js';
import AppVersion from './AppVersion.vue';

const client = useWalletClient();
const emit = defineEmits<{ unlocked: [] }>();

const password = ref('');
const error = ref('');
// Raw error text shown under the friendly message, so bug reports say what
// actually failed. Network/protocol errors only - nothing about wallet contents.
const errorDetail = ref('');
const loading = ref(false);
// Offered on SERVER_UNREACHABLE: usually the active account fails to
// initialize, and the switcher is only reachable after unlocking.
const showRecovery = ref(false);
const recovering = ref(false);
const recoveryDone = ref(false);

async function unlock() {
  if (!password.value) return;
  loading.value = true;
  error.value = '';
  errorDetail.value = '';
  showRecovery.value = false;
  recoveryDone.value = false;
  try {
    await client.unlock(password.value);
    password.value = '';
    emit('unlocked');
  } catch (e: unknown) {
    const msg = String(e);
    if (msg.includes('SERVER_UNREACHABLE')) {
      error.value = "Password was correct, but couldn't reach the Arkade Operator. Check your network settings and try again.";
      errorDetail.value = msg;
      showRecovery.value = true;
    } else if (msg.includes('WALLET_DATA_CORRUPTED')) {
      error.value = 'Your saved wallet data appears to be corrupted. This is not a password problem - retrying will not help.';
    } else {
      error.value = 'Incorrect password';
    }
    password.value = '';
  } finally {
    loading.value = false;
  }
}

async function resetToPrimaryAccount() {
  recovering.value = true;
  try {
    await client.resetToPrimaryAccount();
    recoveryDone.value = true;
    showRecovery.value = false;
  } catch (e: unknown) {
    error.value = String(e);
  } finally {
    recovering.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  // Key-repeat on a held Enter would fire overlapping unlocks.
  if (e.key === 'Enter' && !loading.value && password.value) unlock();
}
</script>

<template>
  <div class="unlock">
    <img class="logo" src="/image/logo.svg" alt="Inscrib3" />
    <p class="subtitle">Insert your password</p>

    <input
      type="password"
      placeholder="Password"
      v-model="password"
      @keydown="onKeydown"
    />

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="errorDetail" class="error-detail">{{ errorDetail }}</p>
    <p v-if="recoveryDone" class="success-hint">Reset - enter your password and try again.</p>

    <button @click="unlock" :disabled="loading || !password">
      <BusyLabel :busy="loading" busy-text="Unlocking…">Unlock</BusyLabel>
    </button>

    <template v-if="showRecovery">
      <p class="subtitle recovery-hint">
        If you recently switched accounts, the one left active may not be reachable. You can reset back to your
        primary account (seed 0) without losing anything - your seed and every account's data stay exactly as they are.
      </p>
      <button type="button" class="secondary" @click="resetToPrimaryAccount" :disabled="recovering">
        <BusyLabel :busy="recovering" busy-text="Resetting…">Reset to primary account</BusyLabel>
      </button>
    </template>

    <AppVersion />
  </div>
</template>

<style scoped>
.unlock {
  position: relative;
  padding: 72px 24px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-height: 100vh;
  background:
    radial-gradient(circle at 74% 15%, rgba(52, 211, 153, 0.09), transparent 28%),
    radial-gradient(circle at 18% 85%, rgba(168, 85, 247, 0.07), transparent 34%);
}
.unlock::before { margin-bottom: 4px; color: var(--color-accent); font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; content: 'INSCRIB3 / WALLET'; }
.logo { width: 86px; height: 86px; margin: 10px 0 6px; object-fit: contain; filter: drop-shadow(0 0 26px rgba(52, 211, 153, 0.14)); }
.subtitle { color: var(--color-text-muted); font-size: 14px; margin-bottom: 8px; }
input {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text);
  font-size: 15px;
  padding: 12px;
  width: 100%;
  text-align: center;
}
button {
  background: var(--color-accent);
  border: none;
  border-radius: 12px;
  color: var(--color-accent-text);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 12px;
  width: 100%;
  margin-top: 4px;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:not(:disabled):hover { box-shadow: 0 0 28px rgba(52, 211, 153, 0.18); transform: translateY(-1px); }
button.secondary { background: rgba(255, 255, 255, 0.025); color: var(--color-text); border: 1px solid var(--color-border); }
.error { color: var(--color-error); font-size: 13px; }
.error-detail { color: var(--color-text-muted); font-size: 11px; font-family: monospace; word-break: break-word; text-align: left; width: 100%; }
.success-hint { color: var(--color-success); font-size: 13px; }
.recovery-hint { margin-top: 16px; text-align: center; }
</style>
