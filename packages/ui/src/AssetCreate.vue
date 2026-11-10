<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getArkadeExplorerTxUrl, type AssetEntry } from '@inscrib3/core';
import { useWalletClient } from './wallet-client-key.js';
import { useNetworkInfo } from './composables/useWalletState.js';
import { errorText, formatAssetAmount, parseAssetAmount } from './format.js';

const client = useWalletClient();
const { network, refresh: refreshNetwork } = useNetworkInfo();

const assets = ref<AssetEntry[]>([]);
const assetsLoading = ref(true);
const assetsError = ref('');
const name = ref('');
const ticker = ref('');
// Number inputs can yield either a string or a number depending on the browser
// and Vue's DOM coercion. Keep both forms valid, especially numeric zero.
const decimalsText = ref<string | number>(0);
const supply = ref('');
const icon = ref('');
const reissuable = ref(false);
const controlAssetId = ref('');
const confirmed = ref(false);
const loading = ref(false);
const error = ref('');
const result = ref<{ arkTxId: string; assetId: string } | null>(null);

const decimals = computed(() => {
  if (String(decimalsText.value).trim() === '') return null;
  const value = Number(decimalsText.value);
  return Number.isInteger(value) && value >= 0 && value <= 18 ? value : null;
});
const rawSupply = computed(() => decimals.value === null ? null : parseAssetAmount(supply.value, decimals.value));
const heldControlAssets = computed(() => assets.value.filter((asset) => asset.amount > 0));
const explorerUrl = computed(() =>
  result.value && network.value ? getArkadeExplorerTxUrl(network.value, result.value.arkTxId) : null,
);

function assetLabel(asset: AssetEntry): string {
  const label = asset.metadata?.ticker ?? asset.metadata?.name ?? `${asset.assetId.slice(0, 8)}…`;
  return `${label} · ${formatAssetAmount(asset)} held · ${asset.assetId.slice(0, 8)}…`;
}

onMounted(async () => {
  void refreshNetwork();
  try {
    assets.value = await client.getAssets();
  } catch (e: unknown) {
    assetsError.value = errorText(e);
  } finally {
    assetsLoading.value = false;
  }
});

async function submit() {
  error.value = '';
  result.value = null;
  if (!name.value.trim()) { error.value = 'Name is required'; return; }
  if (!ticker.value.trim()) { error.value = 'Ticker is required'; return; }
  if (decimals.value === null) { error.value = 'Decimals must be between 0 and 18'; return; }
  if (!rawSupply.value || rawSupply.value <= 0) { error.value = `Invalid initial supply (up to ${decimals.value} decimal places)`; return; }
  if (reissuable.value && !controlAssetId.value) { error.value = 'Select a control asset'; return; }
  if (!confirmed.value) { error.value = 'Review and confirm the asset details'; return; }

  loading.value = true;
  try {
    result.value = await client.issueAsset({
      amount: rawSupply.value,
      ...(reissuable.value ? { controlAssetId: controlAssetId.value } : {}),
      metadata: {
        name: name.value.trim(),
        ticker: ticker.value.trim(),
        decimals: decimals.value,
        ...(icon.value.trim() ? { icon: icon.value.trim() } : {}),
      },
    });
    confirmed.value = false;
  } catch (e: unknown) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="asset-create">
    <div class="form-grid">
      <label>
        Name
        <input v-model="name" type="text" maxlength="64" placeholder="Example Token" :disabled="loading" />
      </label>
      <label>
        Ticker
        <input v-model="ticker" type="text" maxlength="16" placeholder="EXT" :disabled="loading" />
      </label>
      <label>
        Decimals
        <input v-model.number="decimalsText" type="number" min="0" max="18" step="1" :disabled="loading" />
      </label>
      <label>
        Initial supply
        <input v-model="supply" type="text" inputmode="decimal" placeholder="1000000" :disabled="loading" />
      </label>
    </div>
    <p v-if="rawSupply !== null" class="hint">{{ rawSupply.toLocaleString() }} raw unit{{ rawSupply === 1 ? '' : 's' }}</p>

    <label>
      Icon URL <span class="optional">optional</span>
      <input v-model="icon" type="url" placeholder="https://example.com/token.png" :disabled="loading" />
    </label>

    <div class="reissuable-box">
      <label class="check-row">
        <input v-model="reissuable" type="checkbox" :disabled="loading || heldControlAssets.length === 0" />
        <span>
          <strong>Reissuable supply</strong>
          <small>Future supply can be created only while this wallet holds part of the selected control asset.</small>
        </span>
      </label>
      <p v-if="assetsLoading" class="hint">Loading control assets…</p>
      <p v-else-if="assetsError" class="hint warning">Could not load control assets: {{ assetsError }}</p>
      <p v-else-if="heldControlAssets.length === 0" class="hint warning">No control asset is available. Create a non-reissuable asset first if you want to use it as a control asset.</p>
      <label v-else-if="reissuable">
        Control asset
        <select v-model="controlAssetId" :disabled="loading">
          <option value="" disabled>Select an asset</option>
          <option v-for="asset in heldControlAssets" :key="asset.assetId" :value="asset.assetId">{{ assetLabel(asset) }}</option>
        </select>
      </label>
    </div>

    <div class="summary">
      <p class="summary-title">Review</p>
      <div><span>Asset</span><strong>{{ name.trim() || '—' }} · {{ ticker.trim() || '—' }}</strong></div>
      <div><span>Initial supply</span><strong>{{ supply || '—' }}</strong></div>
      <div><span>Raw supply</span><strong>{{ rawSupply?.toLocaleString() ?? '—' }}</strong></div>
      <div><span>Reissuable</span><strong>{{ reissuable ? 'Yes' : 'No' }}</strong></div>
      <div v-if="reissuable"><span>Control asset</span><strong class="asset-id">{{ controlAssetId || '—' }}</strong></div>
    </div>

    <label class="check-row confirmation">
      <input v-model="confirmed" type="checkbox" :disabled="loading" />
      <span>I reviewed the immutable metadata and initial supply.</span>
    </label>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="result" class="success">
      <strong>Asset created</strong>
      <p>Asset ID</p>
      <p class="id">{{ result.assetId }}</p>
      <a v-if="explorerUrl" :href="explorerUrl" target="_blank" rel="noopener noreferrer">View transaction ↗</a>
    </div>

    <button class="submit-btn" type="button" :disabled="loading || !confirmed" @click="submit">
      {{ loading ? 'Creating…' : 'Create asset' }}
    </button>
  </div>
</template>

<style scoped>
.asset-create { display: flex; flex-direction: column; gap: 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
label { color: #aaa; display: flex; flex-direction: column; font-size: 13px; gap: 6px; }
input, select { background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); font-size: 14px; min-width: 0; padding: 10px 12px; width: 100%; }
.optional { color: var(--color-text-muted); font-size: 11px; }
.hint { color: var(--color-text-muted); font-size: 11px; }
.hint.warning { color: #e0a030; line-height: 1.4; }
.reissuable-box, .summary { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.check-row { align-items: flex-start; flex-direction: row; line-height: 1.4; }
.check-row input { accent-color: var(--color-accent); flex-shrink: 0; margin-top: 2px; padding: 0; width: auto; }
.check-row span { display: flex; flex-direction: column; gap: 2px; }
.check-row small { color: var(--color-text-muted); font-size: 11px; }
.summary-title { color: var(--color-accent); font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.summary > div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.summary > div span { color: var(--color-text-muted); }
.summary > div strong { text-align: right; }
.asset-id { font-family: monospace; font-size: 10px; max-width: 65%; overflow-wrap: anywhere; }
.confirmation { background: rgba(52, 211, 153, 0.05); border: 1px solid var(--color-border-accent); border-radius: 8px; padding: 10px; }
.error { color: var(--color-error); font-size: 13px; }
.success { background: #0d1f0d; border: 1px solid #2a5c2a; border-radius: 8px; color: var(--color-success); display: flex; flex-direction: column; gap: 5px; padding: 12px; }
.success p { font-size: 11px; }
.success .id { color: var(--color-text-muted); font-family: monospace; overflow-wrap: anywhere; }
.success a { color: var(--color-accent-secondary); font-size: 12px; text-decoration: none; }
.submit-btn { background: var(--color-accent); border: none; border-radius: 8px; color: var(--color-accent-text); cursor: pointer; font-size: 15px; font-weight: 600; padding: 12px; width: 100%; }
.submit-btn:disabled { cursor: not-allowed; opacity: 0.5; }
@media (max-width: 380px) { .form-grid { grid-template-columns: 1fr; } }
</style>
