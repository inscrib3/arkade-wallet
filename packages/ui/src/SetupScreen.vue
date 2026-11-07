<script setup lang="ts">
import { ref } from 'vue';
import { useWalletClient } from './wallet-client-key.js';
import { useCopyToClipboard } from './composables/useCopyToClipboard.js';
import Icon from './Icon.vue';

const client = useWalletClient();

const emit = defineEmits<{ complete: [] }>();

type Mode = 'choose' | 'create-password' | 'create-mnemonic' | 'restore';

const mode = ref<Mode>('choose');
const mnemonic = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);
const generatedMnemonic = ref('');
const { copied, copy: copyMnemonic } = useCopyToClipboard(2000, 30_000);

function goToCreatePassword() {
  mode.value = 'create-password';
  error.value = '';
}

function goToRestore() {
  mode.value = 'restore';
  mnemonic.value = '';
  error.value = '';
}

function backToChoose() {
  mode.value = 'choose';
  error.value = '';
}

async function submitPassword() {
  error.value = '';
  if (password.value.length < 4) { error.value = 'Password must be at least 4 characters'; return; }
  if (password.value !== confirmPassword.value) { error.value = 'Passwords do not match'; return; }

  loading.value = true;
  try {
    generatedMnemonic.value = await client.generateMnemonic();
    mnemonic.value = generatedMnemonic.value;
    mode.value = 'create-mnemonic';
  } catch (e: unknown) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function finishCreate() {
  error.value = '';
  loading.value = true;
  try {
    await client.create(mnemonic.value.trim(), password.value);
    // Clear only on success: retrying must not send an empty password.
    password.value = '';
    confirmPassword.value = '';
    emit('complete');
  } catch (e: unknown) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function submitRestore() {
  error.value = '';
  if (password.value.length < 4) { error.value = 'Password must be at least 4 characters'; return; }
  if (password.value !== confirmPassword.value) { error.value = 'Passwords do not match'; return; }
  if (!mnemonic.value.trim()) { error.value = 'Mnemonic is required'; return; }

  loading.value = true;
  try {
    await client.restore(mnemonic.value.trim(), password.value);
    password.value = '';
    confirmPassword.value = '';
    emit('complete');
  } catch (e: unknown) {
    error.value = String(e);
    password.value = '';
    confirmPassword.value = '';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="setup">
    <template v-if="mode === 'choose'">
      <div class="welcome">
        <img class="welcome-logo" src="/image/logo.svg" alt="Inscrib3" />
        <h1>Welcome!</h1>
        <p class="subtitle">Your gateway to programmable Bitcoin.</p>
      </div>
      <div class="actions">
        <button @click="goToCreatePassword" :disabled="loading">Create new wallet</button>
        <button class="secondary" @click="goToRestore">
          Restore from seed phrase
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </template>

    <template v-else-if="mode === 'create-password'">
      <button class="back" @click="backToChoose"><Icon name="arrow-left" :size="14" /> Back</button>
      <h1>Create new password</h1>
      <p class="subtitle">This password will unlock your wallet on this device.</p>

      <label>
        Password
        <input type="password" placeholder="At least 4 characters" v-model="password" />
      </label>
      <label>
        Confirm password
        <input type="password" placeholder="Repeat password" v-model="confirmPassword" />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button @click="submitPassword" :disabled="loading">
        {{ loading ? 'Creating…' : 'Create wallet' }}
      </button>
    </template>

    <template v-else-if="mode === 'create-mnemonic'">
      <h1>Save this recovery phrase<br />in a secure place</h1>
      <div class="mnemonic-display">
        <div class="mnemonic-words">
          <span class="word" v-for="(word, i) in generatedMnemonic.split(' ')" :key="i">
            <span class="num">{{ i + 1 }}.</span> {{ word }}
          </span>
        </div>
      </div>
      <button type="button" class="copy-btn" @click="copyMnemonic(generatedMnemonic)">
        <Icon :name="copied ? 'check' : 'copy'" :size="14" />
        {{ copied ? 'Copied' : 'Copy to clipboard' }}
      </button>
      <p class="clipboard-warning">
        Paste it somewhere safe, then clear your clipboard yourself — it is only wiped automatically if this window stays open for 30 seconds.
      </p>
      <p class="subtitle">
        Anyone with this phrase can access your funds. Never share it, never paste it anywhere else.
      </p>

      <p v-if="error" class="error">{{ error }}</p>

      <button @click="finishCreate" :disabled="loading">
        {{ loading ? 'Finishing…' : 'Next' }}
      </button>
    </template>

    <template v-else-if="mode === 'restore'">
      <button class="back" @click="backToChoose"><Icon name="arrow-left" :size="14" /> Back</button>
      <h1>Restore Wallet</h1>

      <label>
        Seed phrase
        <textarea
          rows="3"
          placeholder="Enter your 12 or 24 word seed phrase"
          v-model="mnemonic"
        ></textarea>
      </label>
      <label>
        Password
        <input type="password" placeholder="Min 4 characters" v-model="password" />
      </label>
      <label>
        Confirm password
        <input type="password" placeholder="Repeat password" v-model="confirmPassword" />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button @click="submitRestore" :disabled="loading">
        {{ loading ? 'Restoring…' : 'Restore wallet' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.setup {
  position: relative;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100vh;
  background:
    radial-gradient(circle at 78% 18%, rgba(52, 211, 153, 0.09), transparent 28%),
    radial-gradient(circle at 15% 84%, rgba(168, 85, 247, 0.07), transparent 34%);
}
h1 { font-size: 28px; font-weight: 500; letter-spacing: -0.045em; line-height: 1.08; }
.subtitle { color: var(--color-text-muted); font-size: 14px; }
.welcome { display: flex; flex-direction: column; align-items: center; gap: 9px; margin-top: 68px; text-align: center; }
.welcome::before { color: var(--color-accent); font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; content: 'INSCRIB3 / WALLET'; }
.welcome-logo { width: 86px; height: 86px; object-fit: contain; margin: 12px 0 8px; filter: drop-shadow(0 0 26px rgba(52, 211, 153, 0.14)); }
.back { display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 13px; padding: 0; text-align: left; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #aaa; }
input, textarea {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text);
  font-size: 14px;
  padding: 10px 12px;
  width: 100%;
  resize: none;
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
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:not(:disabled):hover { box-shadow: 0 0 28px rgba(52, 211, 153, 0.18); transform: translateY(-1px); }
button.secondary { background: rgba(255, 255, 255, 0.025); color: var(--color-text); border: 1px solid var(--color-border); }
button.secondary:hover { border-color: var(--color-border-accent); background: rgba(52, 211, 153, 0.045); }
.actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.error { color: var(--color-error); font-size: 13px; }
.clipboard-warning { color: #e0a030; font-size: 12px; line-height: 1.5; }
.mnemonic-display {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
}
.mnemonic-words {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.word {
  font-size: 13px;
  font-family: monospace;
  border: 1px solid var(--color-border-accent);
  border-radius: 6px;
  padding: 4px 6px;
}
.num { color: #666; margin-right: 4px; }
.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  padding: 10px;
}
</style>
