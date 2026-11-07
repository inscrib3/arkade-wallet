import { WalletManager } from '@inscrib3/core';
import { BackgroundRouter } from '../src/lib/messaging/background-router.js';
import { createExtensionKeyValueStore } from '../src/lib/wallet/extension-kv-store.js';
import { checkForNewVersionIfDue, rememberDownloadedUpdates, scheduleVersionCheck } from '../src/lib/wallet/version-check.js';

export default defineBackground({
  type: 'module',
  main() {
    const store = createExtensionKeyValueStore();
    const manager = new WalletManager(store);
    const router = new BackgroundRouter(manager, store);
    router.init();
    rememberDownloadedUpdates(store);
    void checkForNewVersionIfDue(store);
    scheduleVersionCheck();
  },
});
