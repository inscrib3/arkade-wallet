import type { IWallet } from '@arkade-os/sdk';
import { toHistoryEntry, type TxHistoryEntry } from './tx-history.js';

// An assetId is the 32-byte genesis txid followed by a 2-byte group index.
function genesisTxidFromAssetId(assetId: string): string {
  return assetId.slice(0, 64);
}

// metadata.icon is issuer-controlled and assets arrive without opt-in, so only
// http(s) is allowed. An https URL can still act as a tracking beacon.
function sanitizeIconUrl(icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  try {
    const parsed = new URL(icon);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? icon : undefined;
  } catch {
    return undefined;
  }
}

export interface AssetInfo {
  assetId: string;
  amount: number;
  displayAmount: number;
  genesisTxid: string;
  metadata?: { name?: string; ticker?: string; decimals?: number; icon?: string };
  /** Present when future supply can be issued by holders of this control asset. */
  controlAssetId?: string;
}

type AssetDetails = Awaited<ReturnType<IWallet['assetManager']['getAssetDetails']>>;

// True when the tx moved this asset, in either direction.
export function txInvolvesAsset(tx: Pick<TxHistoryEntry, 'assets'>, assetId: string): boolean {
  return tx.assets?.some((a) => a.assetId === assetId) ?? false;
}

function toDisplayMetadata(details: AssetDetails): AssetInfo['metadata'] {
  if (!details.metadata) return undefined;
  return {
    name: details.metadata.name,
    ticker: details.metadata.ticker,
    decimals: details.metadata.decimals,
    icon: sanitizeIconUrl(details.metadata.icon),
  };
}

// Earliest transaction time per asset in this wallet's history. Empty if the
// history can't be read: the order then falls back to asset id.
async function firstSeenTimes(wallet: IWallet): Promise<Map<string, number>> {
  const firstSeen = new Map<string, number>();
  try {
    for (const tx of await wallet.getTransactionHistory()) {
      for (const { assetId } of tx.assets ?? []) {
        const known = firstSeen.get(assetId);
        if (known === undefined || tx.createdAt < known) firstSeen.set(assetId, tx.createdAt);
      }
    }
  } catch {
    // order by id below
  }
  return firstSeen;
}

// Assets with no known time go last; ties are broken by id so the order
// never depends on the server's.
function compareNewestFirst(a: string, b: string, firstSeen: Map<string, number>): number {
  const timeA = firstSeen.get(a) ?? -Infinity;
  const timeB = firstSeen.get(b) ?? -Infinity;
  if (timeA !== timeB) return timeB - timeA;
  return a.localeCompare(b);
}

export class AssetService {
  // Metadata and control asset are fixed at issuance, so one lookup per asset
  // is enough for the session. Failed lookups are dropped and retried.
  private readonly detailsCache = new Map<string, Promise<AssetDetails>>();

  clearDetailsCache(): void {
    this.detailsCache.clear();
  }

  private getDetails(wallet: IWallet, assetId: string): Promise<AssetDetails> {
    const cached = this.detailsCache.get(assetId);
    if (cached) return cached;
    const lookup = wallet.assetManager.getAssetDetails(assetId);
    this.detailsCache.set(assetId, lookup);
    lookup.catch(() => this.detailsCache.delete(assetId));
    return lookup;
  }

  // Works for assets no longer held, since it queries by id.
  async getAssetMetadata(wallet: IWallet, assetId: string): Promise<AssetInfo['metadata']> {
    try {
      return toDisplayMetadata(await this.getDetails(wallet, assetId));
    } catch {
      return undefined;
    }
  }

  // SDK balances are bigint; returned as number to match the app-facing API.
  // Newest first: ordered by when this wallet first received or minted each
  // asset, so the list keeps the same order between loads.
  async getAssets(wallet: IWallet): Promise<AssetInfo[]> {
    const [{ assets }, firstSeen] = await Promise.all([wallet.getBalance(), firstSeenTimes(wallet)]);
    const entries = await Promise.all(
      assets.map(async (asset) => {
        let metadata: AssetInfo['metadata'];
        let controlAssetId: string | undefined;
        try {
          const details = await this.getDetails(wallet, asset.assetId);
          controlAssetId = details.controlAssetId;
          metadata = toDisplayMetadata(details);
        } catch { metadata = undefined; }
        const decimals = metadata?.decimals ?? 0;
        const amount = Number(asset.amount);
        return {
          assetId: asset.assetId,
          amount,
          displayAmount: amount / 10 ** decimals,
          genesisTxid: genesisTxidFromAssetId(asset.assetId),
          metadata,
          ...(controlAssetId ? { controlAssetId } : {}),
        };
      }),
    );
    return entries.sort((a, b) => compareNewestFirst(a.assetId, b.assetId, firstSeen));
  }

  async getTransactionHistory(wallet: IWallet, assetId: string, lightningTxids: Set<string>): Promise<TxHistoryEntry[]> {
    const txs = await wallet.getTransactionHistory();
    return txs
      .map((tx) => toHistoryEntry(tx, lightningTxids))
      .filter((tx) => txInvolvesAsset(tx, assetId));
  }
}
