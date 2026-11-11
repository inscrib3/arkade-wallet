import { createApp } from 'vue';
import { WalletApp, WALLET_CLIENT_KEY } from '@inscrib3/ui';
import { createExtensionWalletClient } from './extension-wallet-client.js';
import VersionBanner from './VersionBanner.vue';

export function mountWalletPage() {
  const app = createApp(WalletApp);
  app.provide(WALLET_CLIENT_KEY, createExtensionWalletClient());
  app.mount('#app');

  createApp(VersionBanner).mount('#version-banner');

  return app;
}
