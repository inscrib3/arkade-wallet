<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { describeNetwork, NETWORK_PRESETS, type WalletClientEvent } from '@inscrib3/core';
import { ApprovalRequestBody, SetupScreen, UnlockScreen, useWalletClient } from '@inscrib3/ui';

const props = defineProps<{ origin: string; network?: 'bitcoin' | 'mutinynet'; embedded?: boolean }>();
const client = useWalletClient();
type Screen = 'loading' | 'storage' | 'error' | 'setup' | 'unlock' | 'approve-connect' | 'connected' | 'approve-action';
type RpcRequest = { id: string; method: string; params?: unknown };

const screen = ref<Screen>('loading');
const actionError = ref('');
const busy = ref(false);
const armed = ref(false);
const pending = ref<RpcRequest | null>(null);
const networkLabel = ref('');
const accountLabel = ref('');
const requestedNetwork = props.network ? NETWORK_PRESETS.find((preset) => preset.network === props.network) : undefined;
let removeClientListener: (() => void) | undefined;
const peer = props.embedded ? window.parent : window.opener;

watch(screen, (current) => {
  armed.value = false;
  if (current === 'approve-connect' || current === 'approve-action') setTimeout(() => (armed.value = true), 1000);
});

const params = computed<Record<string, unknown>>(() => {
  const value = pending.value?.params;
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
});
const action = computed(() => pending.value?.method ?? '');
const assets = computed(() => Array.isArray(params.value.assets) ? params.value.assets as Array<{ assetId: string; amount: number }> : []);
const metadata = computed(() => params.value.metadata && typeof params.value.metadata === 'object' ? params.value.metadata as Record<string, unknown> : {});

async function refreshContext(): Promise<void> {
  try {
    networkLabel.value = describeNetwork(await client.getNetworkSettings()).displayName;
    const [active, accounts] = await Promise.all([client.getActiveAccount(), client.listAccounts()]);
    accountLabel.value = accounts.find((item) => item.seedId === active.seedId && item.index === active.index)?.label ?? '';
  } catch { /* context labels are informational */ }
}

async function refreshScreen(): Promise<void> {
  try {
    if (!await client.isCreated()) screen.value = 'setup';
    else if (!await client.isUnlocked()) screen.value = 'unlock';
    else screen.value = 'approve-connect';
  } catch { screen.value = 'error'; }
}

type StorageAccessDocument = Document & {
  hasStorageAccess?: () => Promise<boolean>;
  requestStorageAccess?: () => Promise<void>;
};

async function begin(): Promise<void> {
  const storageDocument = document as StorageAccessDocument;
  if (props.embedded && storageDocument.hasStorageAccess && !await storageDocument.hasStorageAccess()) {
    screen.value = 'storage';
    return;
  }
  await refreshScreen();
}

async function grantStorageAccess(): Promise<void> {
  const storageDocument = document as StorageAccessDocument;
  try {
    await storageDocument.requestStorageAccess?.();
    await refreshScreen();
  } catch {
    actionError.value = 'iOS did not grant access to this wallet. Open wallet.inscrib3.com once in Safari, then return and try again.';
    screen.value = 'error';
  }
}

function post(message: Record<string, unknown>): void {
  peer?.postMessage(message, props.origin);
}

function result(id: string, value: unknown): void {
  post({ type: 'inscrib3:provider_response', id, result: value });
}

function failure(id: string, cause: unknown): void {
  post({ type: 'inscrib3:provider_response', id, error: cause instanceof Error ? cause.message : String(cause) });
}

async function networkInfo() {
  return describeNetwork(await client.getNetworkSettings());
}

async function execute(method: string, rawParams: unknown): Promise<unknown> {
  const input = rawParams && typeof rawParams === 'object' ? rawParams as Record<string, unknown> : {};
  switch (method) {
    case 'arkade_connect': return [await client.getAddress()];
    case 'arkade_disconnect': return true;
    case 'arkade_getAccounts': return [await client.getAddress()];
    case 'arkade_isConnected': return true;
    case 'arkade_getProviderState': return { isConnected: true, isUnlocked: await client.isUnlocked(), network: (await networkInfo()).network, accounts: [await client.getAddress()] };
    case 'arkade_getAddress': return client.getAddress();
    case 'arkade_getBoardingAddress': return client.getBoardingAddress();
    case 'arkade_getXOnlyPublicKey': return client.getXOnlyPublicKey();
    case 'arkade_getBalance': return client.getBalance();
    case 'arkade_getNetwork': return networkInfo();
    case 'arkade_getAssets': return client.getAssets();
    case 'arkade_getTransactionHistory': return client.getTransactionHistory();
    case 'arkade_sendToAddress': return client.send(String(input.address ?? ''), Number(input.amount));
    case 'arkade_sendAsset': return client.sendAsset(String(input.address ?? ''), input.assets as Array<{ assetId: string; amount: number }>, input.bitcoinAmount === undefined ? undefined : Number(input.bitcoinAmount));
    case 'arkade_issueAsset': return client.issueAsset(input as Parameters<typeof client.issueAsset>[0]);
    case 'arkade_reissueAsset': return client.reissueAsset(input as Parameters<typeof client.reissueAsset>[0]);
    case 'arkade_burnAsset': return client.burnAsset(input as Parameters<typeof client.burnAsset>[0]);
    case 'arkade_settle': return client.settle();
    case 'arkade_signMessage': return client.signMessage!(String(input.message ?? ''));
    case 'arkade_switchNetwork': {
      const target = NETWORK_PRESETS.find((preset) => preset.network === input.network);
      if (!target) throw new Error('Unknown network');
      await client.setNetworkSettings({ arkServerUrl: target.arkServerUrl, esploraUrl: target.esploraUrl });
      await refreshContext();
      return true;
    }
    default: throw new Error('Unsupported provider method');
  }
}

const readMethods = new Set([
  'arkade_connect', 'arkade_getAccounts', 'arkade_isConnected', 'arkade_getProviderState', 'arkade_getAddress',
  'arkade_getBoardingAddress', 'arkade_getXOnlyPublicKey', 'arkade_getBalance', 'arkade_getNetwork',
  'arkade_getAssets', 'arkade_getTransactionHistory',
]);
const actionMethods = new Set([
  'arkade_sendToAddress', 'arkade_sendAsset', 'arkade_issueAsset', 'arkade_reissueAsset',
  'arkade_burnAsset', 'arkade_settle', 'arkade_signMessage', 'arkade_switchNetwork',
]);

async function handleRequest(request: RpcRequest): Promise<void> {
  if (pending.value) { failure(request.id, new Error('Another wallet approval is already open')); return; }
  if (request.method === 'arkade_disconnect') {
    result(request.id, true);
    post({ type: 'inscrib3:provider_event', event: 'accountsChanged', data: [] });
    setTimeout(() => window.close(), 100);
    return;
  }
  if (!await client.isUnlocked()) {
    failure(request.id, new Error('Wallet is locked'));
    screen.value = 'unlock';
    window.focus();
    return;
  }
  if (readMethods.has(request.method)) {
    try { result(request.id, await execute(request.method, request.params)); }
    catch (cause) { failure(request.id, cause); }
    return;
  }
  if (!actionMethods.has(request.method)) {
    failure(request.id, new Error('Unsupported provider method'));
    return;
  }
  if (request.method === 'arkade_switchNetwork') {
    const current = await networkInfo();
    const requested = (request.params as { network?: unknown } | undefined)?.network;
    if (current.network === requested) { result(request.id, true); return; }
  }
  pending.value = request;
  actionError.value = '';
  screen.value = 'approve-action';
  window.focus();
}

function onMessage(event: MessageEvent): void {
  if (event.origin !== props.origin || event.source !== peer) return;
  const data = event.data as { type?: unknown; request?: unknown } | null;
  if (!data || data.type !== 'inscrib3:provider_request' || !data.request || typeof data.request !== 'object') return;
  const request = data.request as Partial<RpcRequest>;
  if (typeof request.id !== 'string' || typeof request.method !== 'string') return;
  void handleRequest({ id: request.id, method: request.method, params: request.params });
}

async function approveConnect(): Promise<void> {
  busy.value = true; actionError.value = '';
  try {
    if (requestedNetwork && (await networkInfo()).network !== requestedNetwork.network) {
      await client.setNetworkSettings({ arkServerUrl: requestedNetwork.arkServerUrl, esploraUrl: requestedNetwork.esploraUrl });
    }
    const address = await client.getAddress();
    post({ type: 'inscrib3:connect', accounts: [address], network: (await networkInfo()).network });
    await refreshContext();
    screen.value = 'connected';
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause);
    post({ type: 'inscrib3:connect_failed', error: actionError.value });
  } finally { busy.value = false; }
}

async function approveAction(): Promise<void> {
  const request = pending.value;
  if (!request) return;
  busy.value = true; actionError.value = '';
  try {
    result(request.id, await execute(request.method, request.params));
    pending.value = null;
    screen.value = 'connected';
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause);
    failure(request.id, cause);
    pending.value = null;
    screen.value = 'connected';
  } finally { busy.value = false; }
}

function rejectAction(): void {
  if (pending.value) failure(pending.value.id, new Error('User rejected the request'));
  pending.value = null;
  actionError.value = '';
  screen.value = 'connected';
}

function rejectConnect(): void {
  post({ type: 'inscrib3:connect_rejected' });
  if (!props.embedded) setTimeout(() => window.close(), 100);
}

async function onUnlocked(): Promise<void> {
  await refreshContext();
  screen.value = 'connected';
}

function forwardEvent(event: WalletClientEvent, data?: unknown): void {
  const exposed = event === 'accountChanged' || event === 'networkChanged' || event === 'lock' || event === 'unlock';
  if (exposed) post({ type: 'inscrib3:provider_event', event, data });
  if (event === 'accountChanged' || event === 'networkChanged') {
    void client.getAddress().then((address) => post({ type: 'inscrib3:provider_event', event: 'accountsChanged', data: [address] })).catch(() => undefined);
  }
  if (event === 'lock') screen.value = 'unlock';
  if (event === 'networkChanged' || event === 'accountChanged') void refreshContext();
}

onMounted(() => {
  window.addEventListener('message', onMessage);
  removeClientListener = client.onEvent(forwardEvent);
  void begin();
});
onBeforeUnmount(() => { window.removeEventListener('message', onMessage); removeClientListener?.(); });
watch(screen, (current) => { if (current === 'approve-connect' || current === 'connected') void refreshContext(); });
</script>

<template>
  <div v-if="screen === 'loading'" class="loading">Loading…</div>
  <div v-else-if="screen === 'storage'" class="storage-access"><div class="connected-mark">↗</div><h1>Use your Inscrib3 Wallet</h1><p>iOS isolates wallet storage inside installed Apps. Continue to grant this verified wallet frame access to the wallet you already created on wallet.inscrib3.com.</p><div class="origin-badge">{{ origin }}</div><button class="approve" @click="grantStorageAccess">Continue securely</button><button class="reject" @click="rejectConnect">Cancel</button></div>
  <div v-else-if="screen === 'error'" class="loading"><p>Couldn't read the wallet state.</p><button @click="refreshScreen">Retry</button></div>
  <SetupScreen v-else-if="screen === 'setup'" @complete="screen = 'approve-connect'" />
  <UnlockScreen v-else-if="screen === 'unlock'" @unlocked="onUnlocked" />

  <div v-else-if="screen === 'approve-connect'" class="approval">
    <div class="origin-badge">{{ origin }}</div>
    <div class="wallet-context">{{ networkLabel }}<template v-if="accountLabel"> · {{ accountLabel }}</template></div>
    <p v-if="requestedNetwork && requestedNetwork.displayName !== networkLabel" class="network-request">This App requests <strong>{{ requestedNetwork.displayName }}</strong>. Approving switches the wallet before connecting.</p>
    <ApprovalRequestBody kind="connect" />
    <p v-if="actionError" class="description error">{{ actionError }}</p>
    <div class="actions"><button class="reject" :disabled="busy" @click="rejectConnect">Reject</button><button class="approve" :disabled="busy || !armed" @click="approveConnect">{{ busy ? 'Connecting…' : 'Approve' }}</button></div>
  </div>

  <div v-else-if="screen === 'approve-action' && pending" class="approval">
    <div class="origin-badge">{{ origin }}</div><div class="wallet-context">{{ networkLabel }}<template v-if="accountLabel"> · {{ accountLabel }}</template></div>
    <ApprovalRequestBody v-if="action === 'arkade_sendToAddress'" kind="send" :address="String(params.address ?? '')" :amount="Number(params.amount)" />
    <ApprovalRequestBody v-else-if="action === 'arkade_sendAsset'" kind="sendAsset" :address="String(params.address ?? '')" :amount="params.bitcoinAmount === undefined ? null : Number(params.bitcoinAmount)" :assets="assets" />
    <template v-else-if="action === 'arkade_issueAsset'"><h1>Issue asset?</h1><div class="details"><p><span>Raw supply</span><b>{{ Number(params.amount).toLocaleString() }}</b></p><p v-if="params.controlAssetId"><span>Control asset</span><code>{{ params.controlAssetId }}</code></p><p><span>Name / ticker</span><b>{{ metadata.name ?? 'Unnamed' }} · {{ metadata.ticker ?? '—' }}</b></p><p><span>Decimals</span><b>{{ metadata.decimals ?? 0 }}</b></p></div></template>
    <template v-else-if="action === 'arkade_reissueAsset' || action === 'arkade_burnAsset'"><h1>{{ action === 'arkade_burnAsset' ? 'Burn asset?' : 'Reissue asset?' }}</h1><div class="details"><p><span>Asset</span><code>{{ params.assetId }}</code></p><p><span>Raw amount</span><b>{{ Number(params.amount).toLocaleString() }}</b></p></div><p v-if="action === 'arkade_burnAsset'" class="warning">Burning permanently destroys these units.</p></template>
    <template v-else-if="action === 'arkade_settle'"><h1>Settle wallet?</h1><p class="description">This renews spendable VTXOs and broadcasts a real transaction.</p></template>
    <template v-else-if="action === 'arkade_signMessage'"><h1>Sign message?</h1><pre>{{ params.message }}</pre><p class="description">Signing proves control of this wallet but does not move funds.</p></template>
    <template v-else-if="action === 'arkade_switchNetwork'"><h1>Switch network?</h1><p class="description">Switch this wallet to <strong>{{ params.network }}</strong>. The active address will change.</p></template>
    <template v-else><h1>Approve wallet request?</h1><p class="description">Method: <code>{{ action }}</code></p></template>
    <p v-if="actionError" class="description error">{{ actionError }}</p>
    <div class="actions"><button class="reject" :disabled="busy" @click="rejectAction">Reject</button><button class="approve" :disabled="busy || !armed" @click="approveAction">{{ busy ? 'Working…' : 'Approve' }}</button></div>
  </div>

  <div v-else class="connected">
    <div class="connected-mark">✓</div><h1>App connected</h1><div class="origin-badge">{{ origin }}</div><p>Keep this wallet window open while using the App. Wallet requests and approvals will appear here.</p><div class="wallet-context">{{ networkLabel }}<template v-if="accountLabel"> · {{ accountLabel }}</template></div>
  </div>
</template>

<style scoped>
.loading,.connected,.storage-access{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;text-align:center}.approval{padding:28px 24px;display:flex;flex-direction:column;gap:14px;min-height:100vh}.origin-badge{background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:999px;padding:4px 12px;font-size:12px;color:#aaa;word-break:break-all}.wallet-context{font-size:12px;color:var(--color-text-muted)}.network-request,.warning{padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;color:var(--color-text-muted);font-size:12px}.warning{color:var(--color-error)}.description,.storage-access p{color:#999;font-size:13px;line-height:1.5}.description.error{color:var(--color-error)}.actions{display:flex;gap:12px;margin-top:auto}button{flex:1;padding:12px;border:0;border-radius:8px;font-weight:600;cursor:pointer}button:disabled{opacity:.5}.reject{background:var(--color-surface-alt);color:var(--color-text)}.approve{background:var(--color-accent);color:#000}.connected-mark{width:52px;height:52px;display:grid;place-items:center;border-radius:50%;background:var(--color-accent);color:#000;font-size:28px}.connected p{max-width:300px;color:var(--color-text-muted);line-height:1.5}.details{display:flex;flex-direction:column;gap:8px}.details p{display:flex;justify-content:space-between;gap:12px;margin:0}.details span{color:var(--color-text-muted)}.details code,.details b{word-break:break-all;text-align:right}pre{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;padding:12px;background:var(--color-surface-alt);border-radius:8px}
</style>
