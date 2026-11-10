<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useWalletClient } from './wallet-client-key.js';
import BalanceView from './BalanceView.vue';
import SendView from './SendView.vue';
import ReceiveView from './ReceiveView.vue';
import SettingsPanel from './SettingsPanel.vue';
import Activity from './Activity.vue';
import Assets from './Assets.vue';
import AssetCreate from './AssetCreate.vue';
import Icon from './Icon.vue';
import type { IncomingFundsSummary } from '@inscrib3/core';

const emit = defineEmits<{ locked: [] }>();

const TOAST_DURATION_MS = 6000;

type Section = 'home' | 'activity' | 'settings';
// Home's sub-screens, each opened from the home page and closed with Back.
// A send's asset is SendView's key: 'btc' or 'ark:<assetId>'.
type Screen =
  | { kind: 'home' }
  | { kind: 'send'; asset: string }
  | { kind: 'receive' }
  | { kind: 'create-asset' }
  | { kind: 'ark-asset'; assetId: string };

const section = ref<Section>('home');
const screen = ref<Screen>({ kind: 'home' });

function goHome() {
  section.value = 'home';
  screen.value = { kind: 'home' };
}

function openSend(asset: string) {
  screen.value = { kind: 'send', asset };
}

const client = useWalletClient();

// Bumped when funds land to remount the read-only views. Not applied to the
// send forms: incoming funds must not wipe a half-filled send.
const dataKey = ref(0);
const received = ref<IncomingFundsSummary | null>(null);
const cacheResetDone = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;

onMounted(() => {
  unsubscribe = client.onEvent((event, data) => {
    if (event !== 'fundsReceived') return;
    dataKey.value++;
    received.value = data as IncomingFundsSummary;
    hideToastsLater();
  });
});

function hideToastsLater() {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    received.value = null;
    cacheResetDone.value = false;
  }, TOAST_DURATION_MS);
}

function onCacheReset() {
  dataKey.value++;
  goHome();
  cacheResetDone.value = true;
  hideToastsLater();
}

onUnmounted(() => {
  unsubscribe?.();
  clearTimeout(toastTimer);
});

async function lock() {
  await client.lock();
  emit('locked');
}
</script>

<template>
  <div class="dashboard">
    <header>
      <a class="logo" href="https://inscrib3.com/" target="_blank" rel="noopener noreferrer">
        <img src="/image/logo.svg" alt="" />
        <span>INSCRIB3</span>
      </a>
      <button class="icon-btn" @click="lock" title="Lock wallet"><Icon name="lock" :size="18" /></button>
    </header>

    <p v-if="cacheResetDone" class="toast">Local cache reset. Balance and history have been re-synced.</p>
    <p v-if="received" class="toast">
      Received {{ received.amountSats.toLocaleString() }} sats
      <span class="funds-layer">{{ received.type === 'vtxo' ? 'offchain' : 'onchain' }}</span>
    </p>

    <div class="body">
      <div class="content">
        <!-- Kept alive while another screen is open, so coming back shows the
             last data at once and refreshes it in the background. -->
        <KeepAlive :max="1">
          <BalanceView
            v-if="section === 'home' && screen.kind === 'home'"
            :key="dataKey"
            @send="openSend('btc')"
            @receive="screen = { kind: 'receive' }"
            @open-asset="(assetId) => (screen = { kind: 'ark-asset', assetId })"
            @create-asset="screen = { kind: 'create-asset' }"
            @see-all-activity="section = 'activity'"
          />
        </KeepAlive>

        <template v-if="section === 'home'">
          <div v-if="screen.kind === 'send'" class="screen">
            <button type="button" class="back" @click="goHome"><Icon name="arrow-left" :size="14" /> Back</button>
            <h2>Send</h2>
            <SendView :initial-asset="screen.asset" />
          </div>

          <div v-else-if="screen.kind === 'receive'" class="screen">
            <button type="button" class="back" @click="goHome"><Icon name="arrow-left" :size="14" /> Back</button>
            <h2>Receive</h2>
            <ReceiveView :refresh-key="dataKey" />
          </div>

          <Assets
            v-else-if="screen.kind === 'ark-asset'"
            :key="dataKey"
            :asset-id="screen.assetId"
            @back="goHome"
            @send="openSend(`ark:${screen.assetId}`)"
          />

          <div v-else-if="screen.kind === 'create-asset'" class="screen">
            <button type="button" class="back" @click="goHome"><Icon name="arrow-left" :size="14" /> Back</button>
            <h2>Create asset</h2>
            <AssetCreate />
          </div>
        </template>

        <div v-else-if="section === 'activity'" class="screen">
          <h2>Activity</h2>
          <Activity :key="dataKey" />
        </div>

        <SettingsPanel v-else-if="section === 'settings'" @cache-reset="onCacheReset" />
      </div>
    </div>

    <nav class="bottom-nav">
      <button :class="{ active: section === 'home' }" @click="goHome">
        <Icon name="home" :size="20" />
        Home
      </button>
      <button :class="{ active: section === 'activity' }" @click="section = 'activity'">
        <Icon name="clock" :size="20" />
        Activity
      </button>
      <button :class="{ active: section === 'settings' }" @click="section = 'settings'">
        <Icon name="settings" :size="20" />
        Settings
      </button>
    </nav>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(60, 180, 120, 0.12);
  border: 1px solid var(--color-success);
  border-radius: 8px;
  color: var(--color-success);
  font-size: 13px;
  font-weight: 600;
  margin: 0 12px 8px;
  padding: 8px 12px;
}
.funds-layer { color: var(--color-text-muted); font-size: 11px; font-weight: 500; text-transform: uppercase; }
.dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background:
    radial-gradient(circle at 82% -8%, rgba(52, 211, 153, 0.08), transparent 32%),
    radial-gradient(circle at -12% 78%, rgba(168, 85, 247, 0.06), transparent 34%),
    var(--color-bg);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 62px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(5, 6, 6, 0.72);
  backdrop-filter: blur(18px) saturate(140%);
}
.logo { display: flex; align-items: center; gap: 9px; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-decoration: none; }
.logo img { width: 36px; height: 36px; object-fit: contain; }
.icon-btn { width: 36px; height: 36px; display: grid; place-items: center; background: rgba(255, 255, 255, 0.035); border: 1px solid var(--color-border); border-radius: 10px; cursor: pointer; color: var(--color-text-muted); }
.icon-btn:hover { border-color: var(--color-border-accent); color: var(--color-accent); background: rgba(52, 211, 153, 0.05); }
.body { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
.content { flex: 1; padding: 22px 20px 28px; overflow-y: auto; }
.screen { display: flex; flex-direction: column; gap: 12px; }
.screen h2 { font-size: 22px; font-weight: 500; letter-spacing: -0.035em; }
.back { display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 13px; padding: 0; text-align: left; }
.bottom-nav {
  display: flex;
  border-top: 1px solid var(--color-border);
  background: rgba(5, 6, 6, 0.88);
  backdrop-filter: blur(18px) saturate(140%);
}
.bottom-nav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  gap: 4px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 11px 0 13px;
}
.bottom-nav button::before { position: absolute; top: -1px; width: 28px; height: 1px; background: transparent; content: ''; }
.bottom-nav button.active { color: var(--color-accent); background: linear-gradient(180deg, rgba(52, 211, 153, 0.07), transparent 70%); }
.bottom-nav button.active::before { background: var(--color-accent); box-shadow: 0 0 12px rgba(52, 211, 153, 0.8); }
</style>
