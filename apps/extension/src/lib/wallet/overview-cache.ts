import type { CachedWalletOverview } from '@inscrib3/core';

// The popup is destroyed on every close. Keeping its last-seen data here, in
// the worker's memory only, lets a reopen show it at once while fresh data
// loads. Never written to storage, and cleared on lock like the password.
export class OverviewCache {
  private walletKey: string | null = null;
  private overview: CachedWalletOverview = {};

  // The key is taken before the fetch, so data fetched for an account that was
  // switched away from mid-request never lands under the new account.
  remember<K extends keyof CachedWalletOverview>(walletKey: string, field: K, value: CachedWalletOverview[K]): void {
    if (walletKey !== this.walletKey) {
      this.walletKey = walletKey;
      this.overview = {};
    }
    this.overview[field] = value;
  }

  read(walletKey: string): CachedWalletOverview | null {
    return walletKey === this.walletKey ? this.overview : null;
  }

  clear(): void {
    this.walletKey = null;
    this.overview = {};
  }
}
