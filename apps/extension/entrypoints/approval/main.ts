import { createApp } from 'vue';
import { startLocalization, WALLET_CLIENT_KEY } from '@inscrib3/ui';
import { createExtensionWalletClient } from '../../src/lib/wallet/extension-wallet-client.js';
import App from './App.vue';

startLocalization();
const app = createApp(App);
// The unlock step reuses the popup's UnlockScreen, which needs the wallet client.
app.provide(WALLET_CLIENT_KEY, createExtensionWalletClient());
app.mount('#app');

export default app;
