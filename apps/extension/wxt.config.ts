import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Inscrib3 Wallet',
    description: 'Your gateway to programmable Bitcoin.',
    icons: {
      16: '/icons/icon-16.png',
      32: '/icons/icon-32.png',
      48: '/icons/icon-48.png',
      128: '/icons/icon-128.png',
    },
    // storage, alarms (auto-lock). No tabs or host permissions: tabs.query()
    // still returns ids for broadcasting, and the Ark/Esplora servers allow
    // cross-origin requests (the PWA relies on that too). WXT adds sidePanel
    // itself for entrypoints/sidepanel.
    permissions: ['storage', 'alarms'],
    web_accessible_resources: [
      {
        resources: ['injected.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
  // @ts-expect-error - missing from wxt's bundled Vite types, honored at build time.
  vite: () => ({
    // The one .env (gitignored, shared with apps/pwa) is at the repo root.
    envDir: '../..',
    build: {
      target: 'esnext',
    },
    optimizeDeps: {
      rolldownOptions: {
        output: {
          target: 'esnext',
        },
      },
    },
  }),
});
