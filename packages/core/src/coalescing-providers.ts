import { EsploraProvider, RestIndexerProvider } from '@arkade-os/sdk';

// The popup asks for balance, coins, assets and history at once, and inside
// the SDK each of them makes the same server calls: duplicate onchain lookups
// and, on a busy wallet, duplicate 12-14 s indexer syncs. Identical calls
// already in flight share one request. Nothing is kept once the answer
// arrives, so no result is ever stale.
class InFlightRequests {
  private readonly pending = new Map<string, Promise<unknown>>();

  share<T>(key: string, request: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const started = request().finally(() => this.pending.delete(key));
    this.pending.set(key, started);
    return started;
  }
}

type Coins = Awaited<ReturnType<EsploraProvider['getCoins']>>;
type Transactions = Awaited<ReturnType<EsploraProvider['getTransactions']>>;

export class CoalescingEsploraProvider extends EsploraProvider {
  private readonly inFlight = new InFlightRequests();

  override getCoins(address: string): Promise<Coins> {
    return this.inFlight.share(`coins:${address}`, () => super.getCoins(address));
  }

  override getTransactions(address: string): Promise<Transactions> {
    return this.inFlight.share(`txs:${address}`, () => super.getTransactions(address));
  }
}

type VtxosOptions = Parameters<RestIndexerProvider['getVtxos']>[0];
type VtxosPage = Awaited<ReturnType<RestIndexerProvider['getVtxos']>>;

export class CoalescingIndexerProvider extends RestIndexerProvider {
  private readonly inFlight = new InFlightRequests();

  override getVtxos(opts?: VtxosOptions): Promise<VtxosPage> {
    return this.inFlight.share(`vtxos:${JSON.stringify(opts ?? {})}`, () => super.getVtxos(opts));
  }
}
