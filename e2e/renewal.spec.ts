import { test, expect, type Page, type Route } from '@playwright/test';
import { createWallet } from './fixtures.js';

// Started by playwright.config.ts's webServer.
const PWA_URL = 'http://localhost:4174';

// A fresh wallet has no coins, so the indexer's answer for the wallet's own
// script is replaced with fixture coins. Everything else hits the real server.
type WireVtxo = {
  outpoint: { txid: string; vout: number };
  amount: string;
  script: string;
  createdAt: string;
  expiresAt: string;
  isPreconfirmed: boolean;
  isSwept: boolean;
  isUnrolled: boolean;
  isSpent: boolean;
  commitmentTxids: string[];
  settledBy?: string;
  spentBy?: string;
};

const DAY_S = 24 * 60 * 60;
const nowS = () => Math.floor(Date.now() / 1000);
const txid = (c: string) => c.repeat(64);

function coin(overrides: Partial<WireVtxo> & Pick<WireVtxo, 'outpoint' | 'amount'>): Omit<WireVtxo, 'script'> {
  return {
    createdAt: String(nowS() - 9 * DAY_S),
    expiresAt: String(nowS() + 20 * DAY_S),
    isPreconfirmed: false,
    isSwept: false,
    isUnrolled: false,
    isSpent: false,
    commitmentTxids: [txid('c')],
    ...overrides,
  };
}

function matchesFilter(vtxo: Omit<WireVtxo, 'script'>, params: URLSearchParams): boolean {
  if (params.get('pendingOnly') === 'true') return false;
  if (params.get('spentOnly') === 'true') return vtxo.isSpent;
  if (params.get('spendableOnly') === 'true') return !vtxo.isSpent && !vtxo.isSwept;
  if (params.get('recoverableOnly') === 'true') return !vtxo.isSpent && vtxo.isSwept;
  return true;
}

async function serveWalletCoins(page: Page, coins: Omit<WireVtxo, 'script'>[]): Promise<void> {
  let walletScript: string | null = null;
  await page.route('**/v1/indexer/vtxos?**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    const scripts = params.getAll('scripts');
    walletScript ??= scripts[0] ?? null;
    if (!walletScript || !scripts.includes(walletScript)) return route.continue();
    const vtxos = coins.filter((c) => matchesFilter(c, params)).map((c) => ({ ...c, script: walletScript! }));
    await route.fulfill({ json: { vtxos, page: { current: 0, next: 0, total: 0 } } });
  });
}

test.describe('VTXO renewal', () => {
  test('a swept coin is renewed automatically; the button only shows once that is stuck', async ({ page }) => {
    await page.clock.install();
    await serveWalletCoins(page, [
      coin({ outpoint: { txid: txid('a'), vout: 0 }, amount: '135783', isSwept: true, expiresAt: String(nowS() - DAY_S) }),
    ]);
    await page.goto(PWA_URL);
    await createWallet(page);

    await expect(page.getByText('1 VTXO has expired and been swept by the server. It is still yours.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Renewing automatically. This takes a minute or two.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renew now' })).toHaveCount(0);

    // The fixture coin can't really be renewed, so it stays swept: after the
    // grace period the wallet offers the manual button.
    await page.clock.fastForward('05:01');
    await expect(page.getByRole('button', { name: 'Renew now' })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("Automatic renewal hasn't finished yet. You can start it yourself.")).toBeVisible();
  });

  test('a renewal reads as a renewal fee in activity, not as a send', async ({ page }) => {
    const renewalCommitment = txid('e');
    await serveWalletCoins(page, [
      coin({
        outpoint: { txid: txid('a'), vout: 0 },
        amount: '135783',
        isSpent: true,
        settledBy: renewalCommitment,
        spentBy: txid('f'),
      }),
      coin({
        outpoint: { txid: txid('b'), vout: 0 },
        amount: '135511',
        commitmentTxids: [renewalCommitment],
        createdAt: String(nowS() - 60),
      }),
    ]);
    await page.goto(PWA_URL);
    await createWallet(page);
    await expect(page.getByText('RECENT ACTIVITY', { exact: false })).toBeVisible({ timeout: 20_000 });

    // The intent the SDK stores when this device joins a batch; no onchain
    // output means it only renewed the wallet's own coins.
    await page.evaluate(async (commitmentTransactionId) => {
      const databases = await indexedDB.databases();
      const name = databases.map((d) => d.name).find((n) => n?.startsWith('arkade-intents-'));
      if (!name) throw new Error('intent database not found');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['intents'], 'readwrite');
        tx.objectStore('intents').put({
          intentTxId: 'd'.repeat(64),
          state: 'batch_succeeded',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          registerProof: '',
          registerProofMessage: JSON.stringify({ type: 'register', onchain_output_indexes: [], valid_at: 0, expire_at: 0, cosigners_public_keys: [] }),
          deleteProof: '',
          deleteProofMessage: '{"type":"delete","expire_at":0}',
          commitmentTransactionId,
          partialForfeits: [],
          intentVtxos: [],
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, renewalCommitment);

    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText('Renewal fee')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('-272 sats')).toBeVisible();
    await expect(page.getByText('Sent', { exact: true })).toHaveCount(0);
  });
});
