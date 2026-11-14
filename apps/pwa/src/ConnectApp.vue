<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { describeNetwork, NETWORK_PRESETS } from '@inscrib3/core';
import { SetupScreen, UnlockScreen, ApprovalRequestBody, useWalletClient } from '@inscrib3/ui';
import type { PopupRequest } from './popup-request.js';

// Mounted instead of WalletApp when an app opens this as a popup; answers
// the opener via postMessage.
const props = defineProps<{ request: PopupRequest }>();

type Screen = 'loading' | 'error' | 'setup' | 'unlock' | 'approve' | 'done';

const screen = ref<Screen>('loading');
const client = useWalletClient();
const rejected = ref(false);
const actionError = ref('');
const sending = ref(false);
const requestedNetworkId = props.request.type === 'connect' ? props.request.network : undefined;
const requestedNetwork = requestedNetworkId
  ? NETWORK_PRESETS.find((preset) => preset.network === requestedNetworkId)
  : undefined;

// Approve stays disabled briefly once the approval shows, so a click meant for
// the page underneath can't land on it.
const APPROVE_DELAY_MS = 1000;
const armed = ref(false);
watch(screen, (current) => {
  armed.value = false;
  if (current === 'approve') setTimeout(() => (armed.value = true), APPROVE_DELAY_MS);
});

async function refreshScreen() {
  try {
    const isCreated = await client.isCreated();
    const isUnlocked = await client.isUnlocked();
    if (!isCreated) {
      screen.value = 'setup';
    } else if (!isUnlocked) {
      screen.value = 'unlock';
    } else {
      screen.value = 'approve';
    }
  } catch {
    // Never fall back to setup while a real wallet may exist.
    screen.value = 'error';
  }
}

onMounted(refreshScreen);

// Which wallet would act, so mainnet and testnet requests look different.
const network = ref('');
const account = ref('');
watch(screen, async (current) => {
  if (current !== 'approve') return;
  try {
    network.value = describeNetwork(await client.getNetworkSettings()).displayName;
    const [active, accounts] = await Promise.all([client.getActiveAccount(), client.listAccounts()]);
    account.value = accounts.find((a) => a.seedId === active.seedId && a.index === active.index)?.label ?? '';
  } catch {
    // labels are informational only
  }
});

function onSetupComplete() { screen.value = 'approve'; }
function onUnlocked() { screen.value = 'approve'; }

async function approve() {
  const request = props.request;
  sending.value = true;
  actionError.value = '';
  try {
    // Always the exact opener origin, never '*'.
    if (request.type === 'connect') {
      if (requestedNetwork && describeNetwork(await client.getNetworkSettings()).network !== requestedNetwork.network) {
        await client.setNetworkSettings({ arkServerUrl: requestedNetwork.arkServerUrl, esploraUrl: requestedNetwork.esploraUrl });
      }
      const address = await client.getAddress();
      const activeNetwork = describeNetwork(await client.getNetworkSettings()).network;
      window.opener?.postMessage({ type: 'inscrib3:connect', accounts: [address], network: activeNetwork }, request.origin);
    } else if (request.type === 'send') {
      const txid = await client.send(request.address, request.amount);
      window.opener?.postMessage({ type: 'inscrib3:send', txid }, request.origin);
    } else {
      const txid = await client.sendAsset(request.address, request.assets, request.bitcoinAmount);
      window.opener?.postMessage({ type: 'inscrib3:send_asset', txid }, request.origin);
    }
    screen.value = 'done';
    setTimeout(() => window.close(), 800);
  } catch (e: unknown) {
    actionError.value = String(e);
    const eventType = request.type === 'connect' ? 'inscrib3:connect_failed' : request.type === 'send' ? 'inscrib3:send_failed' : 'inscrib3:send_asset_failed';
    window.opener?.postMessage({ type: eventType, error: actionError.value }, request.origin);
  } finally {
    sending.value = false;
  }
}

function reject() {
  const eventType = props.request.type === 'connect' ? 'inscrib3:connect_rejected' : props.request.type === 'send' ? 'inscrib3:send_rejected' : 'inscrib3:send_asset_rejected';
  window.opener?.postMessage({ type: eventType }, props.request.origin);
  rejected.value = true;
  screen.value = 'done';
  setTimeout(() => window.close(), 800);
}
</script>

<template>
  <div v-if="screen === 'loading'" class="loading">Loading...</div>
  <div v-else-if="screen === 'error'" class="loading">
    <p>Couldn't read the wallet's state.</p>
    <button type="button" @click="refreshScreen">Retry</button>
  </div>
  <SetupScreen v-else-if="screen === 'setup'" @complete="onSetupComplete" />
  <UnlockScreen v-else-if="screen === 'unlock'" @unlocked="onUnlocked" />

  <div v-else-if="screen === 'approve'" class="approval">
    <div class="origin-badge">{{ request.origin }}</div>
    <div v-if="network || account" class="wallet-context" :class="{ mainnet: network === 'Mainnet' }">
      {{ network }}<template v-if="network && account"> · </template>{{ account }}
    </div>
    <p v-if="requestedNetwork && requestedNetwork.displayName !== network" class="network-request">
      This App requests <strong>{{ requestedNetwork.displayName }}</strong>. Approving will switch the wallet before connecting.
    </p>
    <ApprovalRequestBody
      :kind="request.type"
      :address="request.type === 'send' || request.type === 'sendAsset' ? request.address : null"
      :amount="request.type === 'send' ? request.amount : request.type === 'sendAsset' ? request.bitcoinAmount : null"
      :assets="request.type === 'sendAsset' ? request.assets : []"
    />
    <p v-if="actionError" class="description error">{{ actionError }}</p>
    <div class="actions">
      <button class="btn-reject" :disabled="sending" @click="reject">Reject</button>
      <button class="btn-approve" :disabled="sending || !armed" @click="approve">{{ sending ? 'Sending…' : 'Approve' }}</button>
    </div>
  </div>

  <div v-else class="approval done">
    <p class="description">
      {{ rejected ? 'Request rejected. You can close this window.' : 'Done! You can close this window.' }}
    </p>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #888;
  font-size: 14px;
}
.approval {
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100vh;
}
.approval.done { align-items: center; justify-content: center; text-align: center; }
.wallet-context { font-size: 12px; color: var(--color-text-muted); }
.wallet-context.mainnet { color: var(--color-accent); font-weight: 600; }
.network-request { margin: 0; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text-muted); font-size: 12px; line-height: 1.45; }.network-request strong { color: var(--color-accent); }
.origin-badge {
  align-self: flex-start;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: #aaa;
  word-break: break-all;
}
.description { color: #999; font-size: 13px; line-height: 1.5; }
.description.error { color: var(--color-error); }
.actions { display: flex; gap: 12px; margin-top: auto; }
button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-reject { background: var(--color-surface-alt); color: var(--color-text); }
.btn-approve { background: var(--color-accent); color: var(--color-accent-text); }
</style>
