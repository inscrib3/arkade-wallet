import type { AssetEntry, TxHistoryEntry } from '@inscrib3/core';

// toLocaleString() defaults to 3 fraction digits and rounds up
// (0.99996 -> "1"), which would overstate a balance.
export function formatAssetAmount(asset: AssetEntry): string {
  return asset.displayAmount.toLocaleString(undefined, {
    maximumFractionDigits: Math.max(asset.metadata?.decimals ?? 0, 0),
  });
}

// Tells apart assets that share a name.
export function shortAssetId(assetId: string): string {
  return `${assetId.slice(0, 8)}…`;
}

const COMPACT_FROM = 1000;
const SMALL_AMOUNT_MAX_FRACTION_DIGITS = 6;

// For lists: 836,393.97 -> "836.39K", 2,000,000,000,000 -> "2T". Digits are cut,
// never rounded up, so a balance is never shown bigger than it is; the asset's
// own screen shows the exact amount. K/M/B/T on purpose, whatever the locale.
export function formatCompactAssetAmount(asset: AssetEntry): string {
  const decimals = Math.max(asset.metadata?.decimals ?? 0, 0);
  const amount = asset.displayAmount;
  const options: Intl.NumberFormatOptions & { roundingMode: 'trunc' } =
    Math.abs(amount) >= COMPACT_FROM
      ? { notation: 'compact', maximumFractionDigits: 2, roundingMode: 'trunc' }
      : { maximumFractionDigits: Math.min(decimals, SMALL_AMOUNT_MAX_FRACTION_DIGITS), roundingMode: 'trunc' };
  return amount.toLocaleString('en-US', options);
}

// Exact decimal string -> raw units. null for malformed input, more fraction
// digits than the asset has, or a value past MAX_SAFE_INTEGER - never rounded,
// so a send can't silently move more than was typed.
export function parseAssetAmount(input: string, decimals: number): number | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(input.trim());
  if (!match) return null;
  const [, whole = '', fraction = ''] = match;
  if (whole === '' && fraction === '') return null;
  const places = Math.max(decimals, 0);
  if (fraction.length > places) return null;
  const raw = BigInt((whole || '0') + fraction.padEnd(places, '0'));
  return raw > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(raw);
}

// Raw units -> exact decimal string, the inverse of parseAssetAmount.
export function rawToDecimalString(raw: number, decimals: number): string {
  const places = Math.max(decimals, 0);
  const digits = BigInt(raw).toString().padStart(places + 1, '0');
  if (places === 0) return digits;
  const fraction = digits.slice(-places).replace(/0+$/, '');
  const whole = digits.slice(0, -places);
  return fraction ? `${whole}.${fraction}` : whole;
}

// An error as the user should read it: without the "Error: " prefixes that
// String(e) and messages relayed through the background add.
export function errorText(e: unknown): string {
  return String(e).replace(/^(Error:\s*)+/, '');
}

// Preconfirmed Ark and Lightning txs are already spendable and need nothing
// from the user, so only an onchain deposit still waiting to settle reads as
// pending.
export function isAwaitingOnchainConfirmation(tx: Pick<TxHistoryEntry, 'status' | 'layer'>): boolean {
  return tx.layer === 'onchain' && tx.status === 'pending';
}
