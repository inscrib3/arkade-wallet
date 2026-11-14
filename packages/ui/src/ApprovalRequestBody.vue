<script setup lang="ts">
// Shared by the extension approval popup and the PWA popup; each host renders
// its own origin badge and buttons.
withDefaults(
  defineProps<{
    kind: 'connect' | 'send' | 'sendAsset';
    address?: string | null;
    amount?: number | null;
    assets?: Array<{ assetId: string; amount: number }>;
  }>(),
  { address: null, amount: null, assets: () => [] },
);

function sats(n: unknown): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';
}
</script>

<template>
  <template v-if="kind === 'connect'">
    <h1>Connect to your wallet?</h1>
    <p class="description">
      This site will be able to view your Arkade address and request your
      approval before sending any transaction. It cannot move funds
      without your explicit approval each time.
    </p>
  </template>

  <template v-else-if="kind === 'send'">
    <h1>Approve transaction?</h1>
    <div class="tx-details">
      <div class="row">
        <span class="label">Amount</span>
        <span class="value">{{ amount != null ? `${sats(amount)} sats` : '—' }}</span>
      </div>
      <div class="row">
        <span class="label">To</span>
        <span class="value mono">{{ address || '—' }}</span>
      </div>
    </div>
    <p class="description">
      This will broadcast a real transaction from your wallet. Make sure
      you trust this site before approving.
    </p>
  </template>

  <template v-else>
    <h1>Send assets?</h1>
    <div class="tx-details">
      <div class="row" v-for="asset in assets" :key="asset.assetId">
        <span class="label">Asset</span>
        <span class="value mono">{{ asset.assetId }} — {{ sats(asset.amount) }} raw units</span>
      </div>
      <div class="row" v-if="amount != null && amount > 0">
        <span class="label">Plus BTC</span>
        <span class="value">{{ sats(amount) }} sats</span>
      </div>
      <div class="row">
        <span class="label">To</span>
        <span class="value mono">{{ address || '—' }}</span>
      </div>
    </div>
    <p class="description">This will broadcast a real asset transaction from your wallet. Verify every asset, raw amount, BTC carrier, and destination before approving.</p>
  </template>
</template>

<style scoped>
h1 { font-size: 19px; font-weight: 700; }
.description { color: #999; font-size: 13px; line-height: 1.5; }
.tx-details {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.label { color: var(--color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.value { color: var(--color-text); }
.mono { font-family: monospace; font-size: 12px; word-break: break-all; }
</style>
