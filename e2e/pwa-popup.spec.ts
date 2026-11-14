import { test, expect, type Page } from '@playwright/test';
import { startDappServer } from './dapp-server.js';
import { createWallet } from './fixtures.js';

// Different port from the extension suite's app server, which may still be
// shutting down.
const DAPP_PORT = 8766;
const DAPP_URL = `http://localhost:${DAPP_PORT}`;
// Started by playwright.config.ts's webServer.
const PWA_URL = 'http://localhost:4174';

declare global {
  interface Window {
    __popupMessages: Array<Record<string, unknown>>;
    __walletPopup: Window | null;
  }
}

async function trackPopupMessages(dapp: Page): Promise<void> {
  await dapp.evaluate(() => {
    window.__popupMessages = [];
    window.addEventListener('message', (e) => window.__popupMessages.push(e.data as Record<string, unknown>));
  });
}

// What an app using the PWA fallback (no extension installed) does.
test.describe('PWA popup connect/send flow (no extension installed)', () => {
  let stopDappServer: () => Promise<void>;

  test.beforeAll(async () => {
    stopDappServer = await startDappServer(DAPP_PORT);
  });

  test.afterAll(async () => {
    await stopDappServer();
  });

  test('provider session selects the network, serves reads, and reviews financial requests', async ({
    page,
    context,
  }) => {
    await page.goto(DAPP_URL);
    await trackPopupMessages(page);

    // --- connect, from a fresh wallet ---
    const connectUrl = `${PWA_URL}/?arkade_connect_origin=1&arkade_connect_network=mutinynet`;
    const connectPopupPromise = context.waitForEvent('page');
    await page.evaluate((url) => { window.__walletPopup = window.open(url, 'inscrib3-wallet', 'width=380,height=640'); }, connectUrl);
    const connectPopup = await connectPopupPromise;
    await connectPopup.waitForLoadState('domcontentloaded');

    await createWallet(connectPopup);
    await expect(connectPopup.getByText('Connect to your wallet?')).toBeVisible({ timeout: 10_000 });
    await expect(connectPopup.getByText('Mainnet · Account 1')).toBeVisible();
    await expect(connectPopup.getByText('This App requests Mutinynet (testnet)', { exact: false })).toBeVisible();
    await connectPopup.getByRole('button', { name: 'Approve' }).click();

    await expect
      .poll(async () => page.evaluate(() => window.__popupMessages.some((message) => message.type === 'inscrib3:connect')), { timeout: 10_000 })
      .toBe(true);
    const connectMessages = await page.evaluate(() => window.__popupMessages);
    const connectedMessage = connectMessages.find((message) => message.type === 'inscrib3:connect');
    expect(connectedMessage).toBeTruthy();
    const [address] = connectedMessage!.accounts as string[];
    expect(address).toMatch(/^tark1/);
    await expect(connectPopup.getByRole('heading', { name: 'App connected' })).toBeVisible();

    // --- provider reads need no extra approval ---
    await page.evaluate((origin) => window.__walletPopup!.postMessage({ type: 'inscrib3:provider_request', request: { id: 'network', method: 'arkade_getNetwork' } }, origin), PWA_URL);
    await expect.poll(async () => page.evaluate(() => window.__popupMessages.some((message) => message.id === 'network'))).toBe(true);
    const network = (await page.evaluate(() => window.__popupMessages.find((message) => message.id === 'network')))!.result as { network: string };
    expect(network.network).toBe('mutinynet');

    // --- BTC send, rejected in the persistent provider window ---
    await page.evaluate(({ address, origin }) => window.__walletPopup!.postMessage({ type: 'inscrib3:provider_request', request: { id: 'btc-send', method: 'arkade_sendToAddress', params: { address, amount: 1000 } } }, origin), { address, origin: PWA_URL });
    await expect(connectPopup.getByText('Approve transaction?')).toBeVisible({ timeout: 10_000 });
    await expect(connectPopup.getByText('1,000 sats')).toBeVisible();
    await connectPopup.getByRole('button', { name: 'Reject' }).click();
    await expect.poll(async () => page.evaluate(() => window.__popupMessages.some((message) => message.id === 'btc-send'))).toBe(true);
    expect((await page.evaluate(() => window.__popupMessages.find((message) => message.id === 'btc-send')))!.error).toMatch(/rejected/i);

    // --- asset send, rejected after reviewing exact raw units and BTC carrier ---
    const assetId = 'a'.repeat(68);
    await page.evaluate(({ address, assetId, origin }) => window.__walletPopup!.postMessage({ type: 'inscrib3:provider_request', request: { id: 'asset-send', method: 'arkade_sendAsset', params: { address, assets: [{ assetId, amount: 1234 }], bitcoinAmount: 330 } } }, origin), { address, assetId, origin: PWA_URL });
    await expect(connectPopup.getByRole('heading', { name: 'Send assets?' })).toBeVisible({ timeout: 10_000 });
    await expect(connectPopup.getByText(`${assetId} — 1,234 raw units`)).toBeVisible();
    await expect(connectPopup.getByText('330 sats')).toBeVisible();
    await connectPopup.getByRole('button', { name: 'Reject' }).click();
    await expect.poll(async () => page.evaluate(() => window.__popupMessages.some((message) => message.id === 'asset-send'))).toBe(true);

    // --- issuance uses the same explicit approval channel ---
    await page.evaluate((origin) => window.__walletPopup!.postMessage({ type: 'inscrib3:provider_request', request: { id: 'issue', method: 'arkade_issueAsset', params: { amount: 5000, metadata: { name: 'Test asset', ticker: 'TST', decimals: 2 } } } }, origin), PWA_URL);
    await expect(connectPopup.getByRole('heading', { name: 'Issue asset?' })).toBeVisible({ timeout: 10_000 });
    await expect(connectPopup.getByText('Test asset · TST')).toBeVisible();
    await connectPopup.getByRole('button', { name: 'Reject' }).click();
    await expect.poll(async () => page.evaluate(() => window.__popupMessages.some((message) => message.id === 'issue'))).toBe(true);
  });
});
