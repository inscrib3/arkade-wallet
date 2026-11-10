<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useWalletClient } from './wallet-client-key.js';
import { useNetworkInfo } from './composables/useWalletState.js';
import {
  getArkadeExplorerTxUrl,
  type AssetEntry,
  type TxHistoryEntry,
} from '@inscrib3/core';
import Icon from './Icon.vue';
import { formatAssetAmount, parseAssetAmount, rawToDecimalString } from './format.js';

type TxEntry = TxHistoryEntry;

// One Ark asset's detail screen, opened from its home row. Sending goes
// through the shared Send screen.
const props = defineProps<{ assetId: string }>();
const emit = defineEmits<{ back: []; send: [] }>();

const assets = ref<AssetEntry[]>([]);
const loading = ref(true);
const error = ref('');

const selected = ref<AssetEntry | null>(null);
const assetTxs = ref<TxEntry[]>([]);
const assetTxsLoading = ref(false);
const operation = ref<'reissue' | 'burn' | null>(null);
const operationAmount = ref('');
const operationConfirmed = ref(false);
const operationLoading = ref(false);
const operationError = ref('');
const operationTxid = ref('');

const { network, refresh: refreshNetwork } = useNetworkInfo();
const client = useWalletClient();
onMounted(refreshNetwork);
const genesisExplorerUrl = computed(() =>
  selected.value && network.value ? getArkadeExplorerTxUrl(network.value, selected.value.genesisTxid) : null,
);

function txExplorerUrl(txid: string): string | null {
  if (!txid || !network.value) return null;
  return getArkadeExplorerTxUrl(network.value, txid);
}

const decimals = computed(() => selected.value?.metadata?.decimals ?? 0);
const canReissue = computed(() => {
  const controlAssetId = selected.value?.controlAssetId;
  return !!controlAssetId && assets.value.some((asset) => asset.assetId === controlAssetId && asset.amount > 0);
});
const operationRawAmount = computed(() => parseAssetAmount(operationAmount.value, decimals.value));
const operationExplorerUrl = computed(() =>
  operationTxid.value && network.value ? getArkadeExplorerTxUrl(network.value, operationTxid.value) : null,
);

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

function shortTxid(txid: string): string {
  if (!txid) return '—';
  return `${txid.slice(0, 8)}…${txid.slice(-8)}`;
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function tickerOrShortId(asset: AssetEntry): string {
  return asset.metadata?.ticker ?? shortId(asset.assetId);
}

// A tx can move several assets; take this asset's leg.
function selectedAssetLeg(tx: TxEntry) {
  return tx.assets?.find((a) => a.assetId === selected.value?.assetId);
}

// Magnitude only: the SDK amount may already be negative, and the row adds
// its own sign.
function formatTxAssetAmount(tx: TxEntry): string {
  const raw = selectedAssetLeg(tx)?.amount ?? 0;
  return (Math.abs(raw) / 10 ** decimals.value).toLocaleString(undefined, { maximumFractionDigits: Math.max(decimals.value, 0) });
}

// An asset's genesis tx is typed as a send, but the issuer gained the asset.
function assetDirection(tx: TxEntry): 'send' | 'receive' {
  return selectedAssetLeg(tx)?.isMint ? 'receive' : tx.type;
}

function assetTxLabel(tx: TxEntry): string {
  if (selectedAssetLeg(tx)?.isMint) return 'Minted';
  return assetDirection(tx) === 'send' ? 'Sent' : 'Received';
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    assets.value = await client.getAssets();
  } catch (e: unknown) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

const ASSET_TX_POLL_INTERVAL_MS = 20_000;
let assetTxPollHandle: ReturnType<typeof setInterval> | null = null;

function stopAssetTxPolling() {
  if (assetTxPollHandle) {
    clearInterval(assetTxPollHandle);
    assetTxPollHandle = null;
  }
}

function startAssetTxPolling() {
  stopAssetTxPolling();
  assetTxPollHandle = setInterval(async () => {
    if (!selected.value) return;
    try {
      assetTxs.value = await client.getAssetTransactionHistory(selected.value.assetId);
    } catch {
      // transient poll error - retry next tick
    }
  }, ASSET_TX_POLL_INTERVAL_MS);
}

async function openDetail(asset: AssetEntry) {
  selected.value = asset;
  assetTxs.value = [];
  assetTxsLoading.value = true;
  let txs: TxEntry[] = [];
  try {
    txs = await client.getAssetTransactionHistory(asset.assetId);
  } catch {
    // leave the list empty on failure
  }
  // A newer call can resolve first if the user navigates quickly.
  if (selected.value?.assetId !== asset.assetId) return;
  assetTxs.value = txs;
  assetTxsLoading.value = false;
  startAssetTxPolling();
}

function openOperation(next: 'reissue' | 'burn') {
  operation.value = next;
  operationAmount.value = '';
  operationConfirmed.value = false;
  operationError.value = '';
  operationTxid.value = '';
}

function closeOperation() {
  operation.value = null;
  operationAmount.value = '';
  operationConfirmed.value = false;
  operationError.value = '';
}

function setOperationMax() {
  if (selected.value) operationAmount.value = rawToDecimalString(selected.value.amount, decimals.value);
}

async function refreshSelectedAsset() {
  if (!selected.value) return;
  const current = selected.value;
  assets.value = await client.getAssets();
  const updated = assets.value.find((asset) => asset.assetId === current.assetId);
  selected.value = updated ?? { ...current, amount: 0, displayAmount: 0 };
  assetTxs.value = await client.getAssetTransactionHistory(current.assetId).catch(() => assetTxs.value);
}

async function submitOperation() {
  if (!selected.value || !operation.value) return;
  operationError.value = '';
  operationTxid.value = '';
  if (operation.value === 'reissue' && !canReissue.value) {
    operationError.value = 'This wallet no longer holds the control asset required for reissuance';
    return;
  }
  const rawAmount = operationRawAmount.value;
  if (!rawAmount || rawAmount <= 0) {
    operationError.value = `Invalid amount (up to ${decimals.value} decimal places)`;
    return;
  }
  if (operation.value === 'burn' && rawAmount > selected.value.amount) {
    operationError.value = 'Amount exceeds your balance';
    return;
  }
  if (operation.value === 'burn' && !operationConfirmed.value) {
    operationError.value = 'Confirm that you understand this burn is permanent';
    return;
  }

  operationLoading.value = true;
  try {
    const input = { assetId: selected.value.assetId, amount: rawAmount };
    operationTxid.value = operation.value === 'reissue'
      ? await client.reissueAsset(input)
      : await client.burnAsset(input);
    operationAmount.value = '';
    operationConfirmed.value = false;
    await refreshSelectedAsset();
  } catch (e: unknown) {
    operationError.value = String(e);
  } finally {
    operationLoading.value = false;
  }
}

function backToHome() {
  stopAssetTxPolling();
  emit('back');
}

onUnmounted(stopAssetTxPolling);

onMounted(async () => {
  await refresh();
  const asset = assets.value.find((a) => a.assetId === props.assetId);
  if (asset) void openDetail(asset);
  else if (!error.value) error.value = 'This asset is no longer held by this wallet.';
});
</script>

<template>
  <div class="assets">
    <template v-if="selected">
      <button type="button" class="back" @click="backToHome"><Icon name="arrow-left" :size="14" /> Back</button>

      <div class="detail-header">
        <span class="asset-icon" v-if="selected.metadata?.icon"><img :src="selected.metadata.icon" :alt="tickerOrShortId(selected)" referrerpolicy="no-referrer" loading="lazy" /></span>
        <span class="asset-icon placeholder" v-else>{{ tickerOrShortId(selected).slice(0, 1).toUpperCase() }}</span>
        <div>
          <h2>{{ selected.metadata?.name ?? tickerOrShortId(selected) }}</h2>
          <p class="hint">{{ tickerOrShortId(selected) }}</p>
        </div>
      </div>

      <div class="balance-box">
        <span class="balance-amount">{{ formatAssetAmount(selected) }}</span>
        <span class="balance-raw">{{ selected.amount.toLocaleString() }} raw units · {{ decimals }} decimals</span>
      </div>

      <div class="asset-actions">
        <button class="submit-btn" @click="stopAssetTxPolling(); emit('send')">Send</button>
        <button v-if="canReissue" class="secondary-btn" @click="openOperation('reissue')">Reissue</button>
        <button class="danger-btn" @click="openOperation('burn')">Burn</button>
      </div>

      <div v-if="operation" class="operation-panel" :class="{ danger: operation === 'burn' }">
        <div class="operation-heading">
          <div>
            <h3>{{ operation === 'reissue' ? 'Reissue asset' : 'Burn asset' }}</h3>
            <p class="operation-note" v-if="operation === 'reissue'">Creates additional supply using the control asset.</p>
            <p class="operation-note warning" v-else>This permanently destroys asset units and cannot be undone.</p>
          </div>
          <button type="button" class="close-btn" @click="closeOperation" :disabled="operationLoading">×</button>
        </div>

        <label>
          Amount ({{ tickerOrShortId(selected) }})
          <div class="amount-row">
            <input type="text" inputmode="decimal" placeholder="0" v-model="operationAmount" :disabled="operationLoading" />
            <button v-if="operation === 'burn'" type="button" class="max-btn" @click="setOperationMax" :disabled="operationLoading">Max</button>
          </div>
        </label>
        <p class="raw-preview" v-if="operationRawAmount !== null">{{ operationRawAmount.toLocaleString() }} raw unit{{ operationRawAmount === 1 ? '' : 's' }}</p>

        <label v-if="operation === 'burn'" class="confirm-row">
          <input type="checkbox" v-model="operationConfirmed" :disabled="operationLoading" />
          <span>I understand that burned units cannot be recovered.</span>
        </label>

        <p v-if="operationError" class="error">{{ operationError }}</p>
        <div v-if="operationTxid" class="operation-success">
          <p>{{ operation === 'reissue' ? 'Reissued' : 'Burned' }} successfully.</p>
          <a v-if="operationExplorerUrl" :href="operationExplorerUrl" target="_blank" rel="noopener noreferrer">View transaction ↗</a>
        </div>
        <button
          type="button"
          :class="operation === 'burn' ? 'danger-submit' : 'submit-btn'"
          :disabled="operationLoading || !operationAmount || (operation === 'burn' && !operationConfirmed)"
          @click="submitOperation"
        >{{ operationLoading ? 'Submitting…' : operation === 'reissue' ? 'Confirm reissuance' : 'Permanently burn' }}</button>
      </div>

      <div class="detail-section">
        <p class="section-title">Asset ID</p>
        <p class="mono-box">{{ selected.assetId }}</p>
      </div>

      <div class="detail-section">
        <p class="section-title">Creation transaction</p>
        <a
          v-if="genesisExplorerUrl"
          :href="genesisExplorerUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="mono-box mono-box-link"
        >{{ shortTxid(selected.genesisTxid) }} ↗</a>
        <p v-else class="mono-box">{{ shortTxid(selected.genesisTxid) }}</p>
      </div>

      <div class="detail-section">
        <p class="section-title">Activity</p>
        <p v-if="assetTxsLoading" class="hint">Loading…</p>
        <p v-else-if="assetTxs.length === 0" class="hint">No transactions for this asset yet</p>
        <div v-else class="tx-list">
          <div v-for="tx in assetTxs" :key="tx.txid + tx.timestamp" class="tx-row">
            <div class="tx-main">
              <span class="tx-type" :class="assetDirection(tx)">
                <Icon :name="assetDirection(tx) === 'send' ? 'arrow-up' : 'arrow-down'" :size="14" />
                {{ assetTxLabel(tx) }}
              </span>
              <span class="tx-amount" :class="assetDirection(tx)">{{ assetDirection(tx) === 'send' ? '-' : '+' }}{{ formatTxAssetAmount(tx) }} {{ tickerOrShortId(selected) }}</span>
            </div>
            <div class="tx-meta">
              <a
                v-if="txExplorerUrl(tx.txid)"
                :href="txExplorerUrl(tx.txid)!"
                target="_blank"
                rel="noopener noreferrer"
                class="tx-id tx-id-link"
              >{{ shortTxid(tx.txid) }} ↗</a>
              <span v-else class="tx-id">{{ shortTxid(tx.txid) }}</span>
              <span class="tx-status" :class="tx.status">{{ tx.status }}</span>
            </div>
            <div class="tx-date">{{ formatDate(tx.timestamp) }}</div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <button type="button" class="back" @click="backToHome"><Icon name="arrow-left" :size="14" /> Back</button>
      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
    </template>
  </div>
</template>

<style scoped>
.assets { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--color-text-muted); font-size: 14px; padding: 20px 0; text-align: center; }
.error { color: var(--color-error); font-size: 13px; }
.asset-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-alt);
  color: var(--color-accent-secondary);
  font-weight: 700;
  font-size: 13px;
}
.asset-icon img { width: 100%; height: 100%; object-fit: cover; }
.back { display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 13px; padding: 0; text-align: left; }
h2 { font-size: 16px; font-weight: 700; }
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
.asset-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px; }
.asset-actions .submit-btn { grid-column: auto; }
.secondary-btn, .danger-btn, .danger-submit {
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 11px 8px;
}
.secondary-btn { background: var(--color-surface-alt); border: 1px solid var(--color-border-accent); color: var(--color-accent); }
.danger-btn { background: transparent; border: 1px solid #7a3535; color: #ff8a80; }
.operation-panel { background: var(--color-surface); border: 1px solid var(--color-border-accent); border-radius: 8px; display: flex; flex-direction: column; gap: 12px; padding: 14px; }
.operation-panel.danger { border-color: #7a3535; }
.operation-heading { display: flex; justify-content: space-between; gap: 12px; }
.operation-heading h3 { font-size: 15px; }
.operation-note { color: var(--color-text-muted); font-size: 12px; margin-top: 4px; }
.operation-note.warning { color: #ff8a80; }
.close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 22px; line-height: 1; padding: 0; }
.operation-panel label { color: #aaa; display: flex; flex-direction: column; font-size: 13px; gap: 6px; }
.amount-row { display: flex; gap: 8px; }
.amount-row input { background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); flex: 1; font-size: 14px; min-width: 0; padding: 10px 12px; }
.max-btn { background: var(--color-surface-alt); border: 1px solid var(--color-border-accent); border-radius: 8px; color: var(--color-accent); cursor: pointer; font-size: 12px; font-weight: 700; padding: 0 14px; }
.raw-preview { color: var(--color-text-muted); font-size: 11px; }
.operation-panel .confirm-row { align-items: flex-start; flex-direction: row; line-height: 1.4; }
.confirm-row input { accent-color: #d9534f; flex-shrink: 0; margin-top: 2px; }
.danger-submit { background: #b33a3a; border: none; color: white; width: 100%; }
.operation-panel button:disabled { cursor: not-allowed; opacity: 0.5; }
.operation-success { background: #0d1f0d; border: 1px solid #2a5c2a; border-radius: 8px; color: var(--color-success); font-size: 13px; padding: 10px; }
.operation-success a { color: var(--color-accent-secondary); display: inline-block; font-size: 12px; margin-top: 5px; text-decoration: none; }
.detail-header { display: flex; align-items: center; gap: 12px; }
.detail-header h2 { margin-bottom: 2px; }
.detail-header .hint { padding: 0; text-align: left; font-size: 13px; }
.balance-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.balance-amount { font-size: 24px; font-weight: 700; font-family: monospace; color: var(--color-text); }
.balance-raw { font-size: 12px; color: var(--color-text-muted); }
.detail-section { display: flex; flex-direction: column; gap: 6px; }
.section-title { font-size: 12px; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.mono-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: monospace;
  font-size: 11px;
  padding: 12px;
  word-break: break-all;
  color: #ccc;
  line-height: 1.5;
}
.mono-box-link { color: var(--color-accent-secondary); text-decoration: none; display: block; }
.mono-box-link:hover { text-decoration: underline; }
.tx-list { display: flex; flex-direction: column; gap: 8px; }
.tx-row {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tx-main { display: flex; justify-content: space-between; align-items: center; }
.tx-type { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #ccc; }
.tx-type.send { color: #ff9f6b; }
.tx-type.receive { color: #4caf50; }
.tx-amount { font-size: 13px; font-weight: 700; font-family: monospace; }
.tx-amount.send { color: #ff9f6b; }
.tx-amount.receive { color: #4caf50; }
.tx-status { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; }
.tx-status.confirmed { background: #0d1f0d; color: #4caf50; }
.tx-status.pending { background: #1f1a0d; color: #e0a030; }
.tx-meta { display: flex; justify-content: space-between; align-items: center; }
.tx-id { font-family: monospace; font-size: 11px; color: #888; }
.tx-id-link { color: var(--color-accent-secondary); text-decoration: none; }
.tx-id-link:hover { text-decoration: underline; }
.tx-date { font-size: 11px; color: #666; }
</style>
