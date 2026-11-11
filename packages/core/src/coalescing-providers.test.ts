import { afterEach, describe, expect, test } from 'bun:test';
import { CoalescingEsploraProvider, CoalescingIndexerProvider } from './coalescing-providers.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function countingFetch(): { urls: string[] } {
  const seen = { urls: [] as string[] };
  globalThis.fetch = (async (input: string | URL) => {
    seen.urls.push(String(input));
    await new Promise((r) => setTimeout(r, 5));
    return new Response(String(input).includes('/v1/indexer/vtxos') ? '{"vtxos":[]}' : '[]', { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return seen;
}

describe('CoalescingEsploraProvider', () => {
  // Regression: one popup open sent the same boarding-address lookup 4 times.
  test('shares one request between identical calls made at the same time', async () => {
    const seen = countingFetch();
    const provider = new CoalescingEsploraProvider('https://esplora.test/api');
    await Promise.all([provider.getCoins('bc1pa'), provider.getCoins('bc1pa'), provider.getCoins('bc1pa')]);
    expect(seen.urls.length).toBe(1);
  });

  test('never reuses an answer once it has arrived', async () => {
    const seen = countingFetch();
    const provider = new CoalescingEsploraProvider('https://esplora.test/api');
    await provider.getCoins('bc1pa');
    await provider.getCoins('bc1pa');
    expect(seen.urls.length).toBe(2);
  });

  test('keeps different addresses and different lookups apart', async () => {
    const seen = countingFetch();
    const provider = new CoalescingEsploraProvider('https://esplora.test/api');
    await Promise.all([provider.getCoins('bc1pa'), provider.getCoins('bc1pb'), provider.getTransactions('bc1pa')]);
    expect(seen.urls.length).toBe(3);
  });
});

describe('CoalescingIndexerProvider', () => {
  // Regression: on first load each read started its own 12-14 s indexer sync.
  test('shares one vtxo query between identical calls made at the same time', async () => {
    const seen = countingFetch();
    const provider = new CoalescingIndexerProvider('https://ark.test');
    const query = { scripts: ['5120aa'], after: 1 };
    await Promise.all([provider.getVtxos(query), provider.getVtxos({ ...query })]);
    expect(seen.urls.length).toBe(1);
  });

  test('keeps different queries apart', async () => {
    const seen = countingFetch();
    const provider = new CoalescingIndexerProvider('https://ark.test');
    await Promise.all([provider.getVtxos({ scripts: ['5120aa'], after: 1 }), provider.getVtxos({ scripts: ['5120aa'], after: 2 })]);
    expect(seen.urls.length).toBe(2);
  });
});
