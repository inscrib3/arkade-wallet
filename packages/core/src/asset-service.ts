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
  async getAssets(wallet: IWallet): Promise<AssetInfo[]> {
    const { assets } = await wallet.getBalance();
    return Promise.all(
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
  }

  async getTransactionHistory(wallet: IWallet, assetId: string, lightningTxids: Set<string>): Promise<TxHistoryEntry[]> {
    const txs = await wallet.getTransactionHistory();
    return txs
      .map((tx) => toHistoryEntry(tx, lightningTxids))
      .filter((tx) => txInvolvesAsset(tx, assetId));
  }
}
