import { describe, expect, test } from 'bun:test';
import { TxType, type IWallet } from '@arkade-os/sdk';
import { AssetService } from './asset-service.js';

// Minimal shape matching what AssetService actually reads off IWallet - not
// the full SDK interface, which carries a lot more this service ignores.
function mockWallet(overrides: {
  assets?: Array<{ assetId: string; amount: bigint }>;
  assetDetails?: (assetId: string) => Promise<{ metadata?: { name?: string; ticker?: string; decimals?: number; icon?: string }; controlAssetId?: string }>;
  txs?: Array<Record<string, unknown>>;
}) {
  return {
    getBalance: async () => ({ assets: overrides.assets ?? [] }),
    assetManager: {
      getAssetDetails: overrides.assetDetails ?? (async () => ({})),
    },
    getTransactionHistory: async () => overrides.txs ?? [],
  } as unknown as IWallet;
}

function mockTx(assetId: string | undefined, overrides: { arkTxid?: string; amount?: number } = {}) {
  return {
    key: { arkTxid: overrides.arkTxid ?? 'tx1', commitmentTxid: '', boardingTxid: '' },
    type: TxType.TxReceived,
    amount: overrides.amount ?? 1000,
    settled: true,
    createdAt: 1_700_000_000_000,
    assets: assetId ? [{ assetId, amount: 1n }] : undefined,
  };
}

describe('AssetService.getAssets', () => {
  test('computes displayAmount using the asset metadata decimals', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 150n }],
      assetDetails: async () => ({ metadata: { name: 'Coin', ticker: 'CO', decimals: 2 } }),
    });
    const [asset] = await service.getAssets(wallet);
    expect(asset.amount).toBe(150);
    expect(asset.displayAmount).toBe(1.5);
  });

  test('defaults decimals to 0 when metadata is absent', async () => {
    const service = new AssetService();
    const wallet = mockWallet({ assets: [{ assetId: 'a1', amount: 150n }], assetDetails: async () => ({}) });
    const [asset] = await service.getAssets(wallet);
    expect(asset.displayAmount).toBe(150);
    expect(asset.metadata).toBeUndefined();
  });

  test('exposes the control asset id when supply is reissuable', async () => {
    const service = new AssetService();
    const controlAssetId = `${'c'.repeat(64)}0000`;
    const wallet = mockWallet({ assets: [{ assetId: 'a1', amount: 150n }], assetDetails: async () => ({ controlAssetId }) });
    const [asset] = await service.getAssets(wallet);
    expect(asset.controlAssetId).toBe(controlAssetId);
  });

  test('falls back to no metadata when the details fetch throws', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 100n }],
      assetDetails: async () => {
        throw new Error('network error');
      },
    });
    const [asset] = await service.getAssets(wallet);
    expect(asset.metadata).toBeUndefined();
    expect(asset.displayAmount).toBe(100);
  });

  test('derives genesisTxid as the first 64 hex chars of the assetId', async () => {
    const service = new AssetService();
    const genesisTxid = 'a'.repeat(64);
    const wallet = mockWallet({ assets: [{ assetId: `${genesisTxid}0001`, amount: 1n }] });
    const [asset] = await service.getAssets(wallet);
    expect(asset.genesisTxid).toBe(genesisTxid);
  });

  test('keeps an https icon URL', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 1n }],
      assetDetails: async () => ({ metadata: { icon: 'https://example.com/icon.png' } }),
    });
    const [asset] = await service.getAssets(wallet);
    expect(asset.metadata?.icon).toBe('https://example.com/icon.png');
  });

  test('drops a non-http(s) icon URL (tracking-pixel/beacon risk)', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 1n }],
      assetDetails: async () => ({ metadata: { icon: 'javascript:alert(1)' } }),
    });
    const [asset] = await service.getAssets(wallet);
    expect(asset.metadata?.icon).toBeUndefined();
  });

  test('drops a malformed icon URL', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 1n }],
      assetDetails: async () => ({ metadata: { icon: 'not a url' } }),
    });
    const [asset] = await service.getAssets(wallet);
    expect(asset.metadata?.icon).toBeUndefined();
  });
});

describe('AssetService.getAssetMetadata', () => {
  test('resolves metadata for an assetId the wallet holds no balance of', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assets: [],
      assetDetails: async () => ({ metadata: { name: 'Coin', ticker: 'CO', decimals: 2 } }),
    });
    const metadata = await service.getAssetMetadata(wallet, 'a1');
    expect(metadata).toEqual({ name: 'Coin', ticker: 'CO', decimals: 2, icon: undefined });
  });

  test('returns undefined when the details fetch throws', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      assetDetails: async () => {
        throw new Error('network error');
      },
    });
    const metadata = await service.getAssetMetadata(wallet, 'a1');
    expect(metadata).toBeUndefined();
  });
});

describe('AssetService.getTransactionHistory', () => {
  test('filters transactions to only those moving the given assetId', async () => {
    const service = new AssetService();
    const wallet = mockWallet({
      txs: [
        mockTx('asset-1', { arkTxid: 'tx1' }),
        mockTx('asset-2', { arkTxid: 'tx2' }),
        mockTx(undefined, { arkTxid: 'tx3' }),
      ],
    });
    const history = await service.getTransactionHistory(wallet, 'asset-1', new Set());
    expect(history.map((h) => h.txid)).toEqual(['tx1']);
  });

  test('returns an empty list when no transaction moves the asset', async () => {
    const service = new AssetService();
    const wallet = mockWallet({ txs: [mockTx('other-asset')] });
    const history = await service.getTransactionHistory(wallet, 'asset-1', new Set());
    expect(history).toEqual([]);
  });
});

describe('AssetService details cache', () => {
  test('looks each asset up once per session, then answers from memory', async () => {
    const service = new AssetService();
    let lookups = 0;
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 1n }],
      assetDetails: async () => (lookups++, { metadata: { ticker: 'CO' } }),
    });
    await service.getAssets(wallet);
    await service.getAssets(wallet);
    expect(await service.getAssetMetadata(wallet, 'a1')).toEqual({ ticker: 'CO', name: undefined, decimals: undefined, icon: undefined });
    expect(lookups).toBe(1);
  });

  test('retries a lookup that failed instead of caching the failure', async () => {
    const service = new AssetService();
    let lookups = 0;
    const wallet = mockWallet({
      assets: [{ assetId: 'a1', amount: 1n }],
      assetDetails: async () => {
        lookups++;
        if (lookups === 1) throw new Error('down');
        return { metadata: { ticker: 'CO' } };
      },
    });
    expect((await service.getAssets(wallet))[0].metadata).toBeUndefined();
    expect((await service.getAssets(wallet))[0].metadata?.ticker).toBe('CO');
    expect(lookups).toBe(2);
  });

  test('forgets everything when cleared (on lock)', async () => {
    const service = new AssetService();
    let lookups = 0;
    const wallet = mockWallet({ assets: [{ assetId: 'a1', amount: 1n }], assetDetails: async () => (lookups++, {}) });
    await service.getAssets(wallet);
    service.clearDetailsCache();
    await service.getAssets(wallet);
    expect(lookups).toBe(2);
  });
});

describe('AssetService.getAssets order', () => {
  function walletWith(history: Array<{ assetId: string; createdAt: number }>) {
    return {
      getBalance: async () => ({ assets: [{ assetId: 'old', amount: 1n }], }),
      assetManager: { getAssetDetails: async () => ({}) },
      getTransactionHistory: async () => history.map((h) => ({ createdAt: h.createdAt, assets: [{ assetId: h.assetId, amount: 1n }] })),
    } as unknown as IWallet;
  }

  test('lists the most recently received asset first, whatever order the server used', async () => {
    const wallet = walletWith([
      { assetId: 'old', createdAt: 100 },
      { assetId: 'new', createdAt: 300 },
      { assetId: 'mid', createdAt: 200 },
      { assetId: 'old', createdAt: 400 },
    ]);
    wallet.getBalance = (async () => ({ assets: ['old', 'mid', 'new'].map((assetId) => ({ assetId, amount: 1n })) })) as never;
    const ids = (await new AssetService().getAssets(wallet)).map((a) => a.assetId);
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  test('falls back to a fixed id order when history is unavailable', async () => {
    const wallet = walletWith([]);
    wallet.getTransactionHistory = (async () => { throw new Error('down'); }) as never;
    wallet.getBalance = (async () => ({ assets: ['b', 'c', 'a'].map((assetId) => ({ assetId, amount: 1n })) })) as never;
    const ids = (await new AssetService().getAssets(wallet)).map((a) => a.assetId);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
