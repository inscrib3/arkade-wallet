import { createApp } from 'vue';
import { WalletApp, WALLET_CLIENT_KEY } from '@inscrib3/ui';
import { createPwaWalletClient } from './pwa-wallet-client.js';
import { setupAutoLock } from './auto-lock.js';
import ConnectApp from './ConnectApp.vue';
import ProviderApp from './ProviderApp.vue';
import UpdateBanner from './UpdateBanner.vue';
import ExtensionBanner from './ExtensionBanner.vue';
import type { PopupRequest } from './popup-request.js';

// The opener controls the URL params, so they only pick the request type.
// document.referrer is the trusted origin; no referrer fails closed.
function verifiedOpenerOrigin(): string | null {
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

function parsePopupRequest(): PopupRequest | null {
  const params = new URLSearchParams(window.location.search);
  const origin = verifiedOpenerOrigin();
  if (!origin) return null;

  if (params.has('arkade_connect_origin')) {
    const requestedNetwork = params.get('arkade_connect_network');
    if (requestedNetwork && requestedNetwork !== 'bitcoin' && requestedNetwork !== 'mutinynet') return null;
    const network: 'bitcoin' | 'mutinynet' | undefined = requestedNetwork === 'bitcoin' || requestedNetwork === 'mutinynet' ? requestedNetwork : undefined;
    return { type: 'connect', origin, ...(network ? { network } : {}) };
  }

  const sendAddress = params.get('arkade_send_address');
  const sendAmountRaw = params.get('arkade_send_amount');
  if (params.has('arkade_send_origin') && sendAddress && sendAmountRaw) {
    const amount = Number(sendAmountRaw);
    if (Number.isSafeInteger(amount) && amount > 0) {
      return { type: 'send', origin, address: sendAddress, amount };
    }
  }

  const assetAddress = params.get('arkade_send_asset_address');
  const assetsRaw = params.get('arkade_send_asset_assets');
  if (params.has('arkade_send_asset_origin') && assetAddress && assetsRaw && assetsRaw.length <= 10_000) {
    try {
      const assets = JSON.parse(assetsRaw) as unknown;
      const bitcoinAmountRaw = params.get('arkade_send_asset_bitcoin_amount');
      const bitcoinAmount = bitcoinAmountRaw === null ? undefined : Number(bitcoinAmountRaw);
      const validAssets = Array.isArray(assets) && assets.length > 0 && assets.length <= 16 && assets.every((asset) => {
        if (!asset || typeof asset !== 'object') return false;
        const value = asset as { assetId?: unknown; amount?: unknown };
        return typeof value.assetId === 'string' && value.assetId.length > 0 && value.assetId.length <= 256
          && Number.isSafeInteger(value.amount) && Number(value.amount) > 0;
      });
      const validBitcoin = bitcoinAmount === undefined || (Number.isSafeInteger(bitcoinAmount) && bitcoinAmount > 0);
      if (validAssets && validBitcoin) return { type: 'sendAsset', origin, address: assetAddress, assets, ...(bitcoinAmount !== undefined ? { bitcoinAmount } : {}) };
    } catch { /* malformed JSON is not a popup request */ }
  }

  return null;
}

// *.github.io is one origin shared by every Pages site on an account, so any
// of them could read this wallet's storage and script its page.
if (location.hostname.endsWith('.github.io')) {
  document.body.textContent = 'This wallet must be served from its own domain, not *.github.io.';
  throw new Error('Refusing to run on a shared github.io origin');
}

const request = parsePopupRequest();
const isPopupMode = !!request && !!window.opener;

const app = isPopupMode
  ? request!.type === 'connect'
    ? createApp(ProviderApp, { origin: request!.origin, network: request!.network })
    : createApp(ConnectApp, { request: request! })
  : createApp(WalletApp);
const client = createPwaWalletClient();
app.provide(WALLET_CLIENT_KEY, client);
app.mount('#app');

// A connected provider window can remain open, so it keeps the same inactivity
// lock as the full PWA. One-shot payment popups close after approval.
if (!isPopupMode || request?.type === 'connect') setupAutoLock(client);

if (!isPopupMode) {
  createApp(UpdateBanner).mount('#update-banner');
  createApp(ExtensionBanner).mount('#extension-banner');
}

export default app;
