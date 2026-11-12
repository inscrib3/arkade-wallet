<script setup lang="ts">
import BusyLabel from './BusyLabel.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useWalletClient } from './wallet-client-key.js';
import { useNetworkInfo } from './composables/useWalletState.js';
import { getArkadeExplorerTxUrl, type AssetEntry } from '@inscrib3/core';
import { formatAssetAmount, parseAssetAmount, rawToDecimalString } from './format.js';
import { coinKey, useCoinControl } from './composables/useCoinControl.js';
import CoinControlPanel from './CoinControlPanel.vue';
import LoadingHint from './LoadingHint.vue';
import { recheckUntil } from './recheck.js';

// Sends one Ark asset to an Ark address; the recipient comes from SendView.
const props = defineProps<{ asset: AssetEntry; recipient: string }>();
// The fresh asset list after a send, so the asset picker above shows it too.
const emit = defineEmits<{ assetsUpdated: [assets: AssetEntry[]] }>();

const client = useWalletClient();
const { network, refresh: refreshNetwork } = useNetworkInfo();
onMounted(refreshNetwork);

// The balance shown and checked, refreshed after each send.
const current = ref<AssetEntry>(props.asset);
const amountDisplay = ref('');
const loading = ref(false);
const error = ref('');
const txid = ref('');
const balanceUpdating = ref(false);
let isUnmounted = false;
onUnmounted(() => { isUnmounted = true; });

const decimals = computed(() => current.value.metadata?.decimals ?? 0);
const ticker = computed(() => current.value.metadata?.ticker ?? `${current.value.assetId.slice(0, 8)}…`);
// Typed in display units and converted with decimals before sending.
const amountRawPreview = computed(() => parseAssetAmount(amountDisplay.value, decimals.value));
const explorerUrl = computed(() => (network.value && txid.value ? getArkadeExplorerTxUrl(network.value, txid.value) : null));

const {
  showCoinControl,
  coins: spendableVtxos,
  coinsLoading: spendableVtxosLoading,
  coinsError: spendableVtxosError,
  selectedOutpoints,
  selectedTotal: selectedVtxoTotal,
  toggleCoinControl,
  toggleCoinSelected: toggleVtxoSelected,
  resetCoinControl,
  chosenOutpoints: selectedVtxos,
  onSelectionStale,
} = useCoinControl(() => client.getSpendableVtxos?.() ?? Promise.resolve([]));

function setMax() {
  amountDisplay.value = rawToDecimalString(current.value.amount, decimals.value);
}

// An asset sent in full drops out of getAssets, so missing reads as zero.
async function waitForBalance(expectedAmount: number) {
  balanceUpdating.value = true;
  try {
    await recheckUntil(
      async () => {
        const assets = await client.getAssets().catch(() => null);
        if (!assets) return false;
        emit('assetsUpdated', assets);
        current.value = assets.find((a) => a.assetId === current.value.assetId) ?? { ...current.value, amount: 0, displayAmount: 0 };
        return current.value.amount === expectedAmount;
      },
      { isCancelled: () => isUnmounted },
    );
  } finally {
    balanceUpdating.value = false;
  }
}

async function submit() {
  error.value = '';
  txid.value = '';
  const rawAmount = amountRawPreview.value;
  if (!rawAmount || rawAmount <= 0) {
    error.value = `Invalid amount (up to ${decimals.value} decimal places)`;
    return;
  }
  if (rawAmount > current.value.amount) { error.value = 'Amount exceeds your balance'; return; }

  loading.value = true;
  try {
    txid.value = await client.sendAsset(
      props.recipient.trim(),
      [{ assetId: current.value.assetId, amount: rawAmount }],
      undefined,
      selectedVtxos(),
    );
    amountDisplay.value = '';
    resetCoinControl();
    void waitForBalance(current.value.amount - rawAmount);
  } catch (e: unknown) {
    const msg = String(e);
    if (msg.includes('SELECTED_VTXOS_NO_LONGER_SPENDABLE')) {
      error.value = 'One of your selected coins is no longer spendable - the list below has been refreshed, pick again.';
      onSelectionStale();
    } else {
      error.value = msg;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="asset-send">
    <label>
      Amount ({{ ticker }})
      <div class="amount-row">
        <input type="text" inputmode="decimal" placeholder="0" v-model="amountDisplay" :disabled="loading" />
        <button type="button" class="max-btn" @click="setMax" :disabled="loading">Max</button>
      </div>
    </label>
    <p class="hint">
      Balance: {{ formatAssetAmount(current) }} {{ ticker }}
      <template v-if="amountRawPreview !== null"> · = {{ amountRawPreview.toLocaleString() }} raw unit{{ amountRawPreview === 1 ? '' : 's' }}</template>
    </p>
    <LoadingHint v-if="balanceUpdating" label="Updating balance…" />

    <CoinControlPanel
      v-if="client.getSpendableVtxos"
      :open="showCoinControl"
      :loading="spendableVtxosLoading"
      :error="spendableVtxosError"
      :is-empty="spendableVtxos.length === 0"
      empty-text="No spendable VTXOs"
      :selected-count="selectedOutpoints.size"
      @toggle="toggleCoinControl"
    >
      <label class="coin-row" v-for="v in spendableVtxos" :key="coinKey(v)">
        <input type="checkbox" :checked="selectedOutpoints.has(coinKey(v))" @change="toggleVtxoSelected(v)" :disabled="loading" />
        <span class="coin-amount">{{ v.value.toLocaleString() }} sats</span>
        <span v-if="v.assetIds.includes(current.assetId)" class="coin-note">carries {{ ticker }}</span>
        <span class="coin-status" :class="v.status">{{ v.status }}</span>
      </label>
      <p class="hint">Selected: {{ selectedVtxoTotal.toLocaleString() }} sats</p>
    </CoinControlPanel>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="txid" class="success">
      <p>Sent!</p>
      <p class="txid">{{ txid }}</p>
      <a v-if="explorerUrl" :href="explorerUrl" target="_blank" rel="noopener noreferrer" class="explorer-link">View on Arkade Explorer ↗</a>
    </div>

    <button class="submit-btn" @click="submit" :disabled="loading || !recipient || !amountDisplay">
      <BusyLabel :busy="loading" busy-text="Sending…">Send</BusyLabel>
    </button>
  </div>
</template>

<style scoped>
.asset-send { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--color-text-muted); font-size: 12px; }
.error { color: var(--color-error); font-size: 13px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #aaa; }
input {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 14px;
  padding: 10px 12px;
  width: 100%;
}
.amount-row { display: flex; gap: 8px; }
.amount-row input { flex: 1; }
.max-btn {
  flex-shrink: 0;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border-accent);
  border-radius: 8px;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 0 14px;
}
button.submit-btn {
  background: var(--color-accent);
  border: none;
  border-radius: 8px;
  color: var(--color-accent-text);
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  width: 100%;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
.success {
  background: #0d1f0d;
  border: 1px solid #2a5c2a;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  color: var(--color-success);
}
.txid { font-family: monospace; font-size: 11px; color: var(--color-text-muted); word-break: break-all; margin-top: 4px; }
.explorer-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--color-accent-secondary);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.explorer-link:hover { text-decoration: underline; }
</style>
