import { describe, expect, test } from 'bun:test';
import type { AssetEntry } from '@inscrib3/core';
import { errorText, formatAssetAmount, formatCompactAssetAmount, isAwaitingOnchainConfirmation, parseAssetAmount, rawToDecimalString } from './format.js';

function asset(overrides: { displayAmount: number; decimals?: number }): AssetEntry {
  return {
    assetId: 'a1',
    amount: 0,
    displayAmount: overrides.displayAmount,
    genesisTxid: 'genesis',
    metadata: overrides.decimals !== undefined ? { decimals: overrides.decimals } : undefined,
  };
}

describe('formatAssetAmount', () => {
  test('respects the asset decimals as the max fraction digits', () => {
    expect(formatAssetAmount(asset({ displayAmount: 1.23456, decimals: 2 }))).toBe('1.23');
  });

  test('defaults to 0 decimals when metadata is absent', () => {
    expect(formatAssetAmount(asset({ displayAmount: 1.9 }))).toBe('2');
  });

  test('preserves precision past 3 fraction digits, unlike bare toLocaleString()', () => {
    expect(formatAssetAmount(asset({ displayAmount: 0.12345678, decimals: 8 }))).toBe('0.12345678');
  });

  test('a whole number is not padded with trailing zeros', () => {
    expect(formatAssetAmount(asset({ displayAmount: 5, decimals: 2 }))).toBe('5');
  });

  test('negative decimals in metadata are floored to 0, not passed through as negative', () => {
    expect(formatAssetAmount(asset({ displayAmount: 1.9, decimals: -2 }))).toBe('2');
  });
});

describe('parseAssetAmount', () => {
  test('converts exactly, with no float error', () => {
    expect(parseAssetAmount('0.29', 8)).toBe(29_000_000);
    expect(parseAssetAmount('1', 2)).toBe(100);
    expect(parseAssetAmount('.5', 1)).toBe(5);
    expect(parseAssetAmount('12.', 0)).toBe(12);
  });

  test('rejects more fraction digits than the asset has, instead of rounding', () => {
    expect(parseAssetAmount('0.123', 2)).toBeNull();
    expect(parseAssetAmount('1.5', 0)).toBeNull();
  });

  test('rejects malformed, negative, exponent and oversized input', () => {
    for (const bad of ['', '.', 'abc', '-1', '1e3', '1.2.3', '9007199254740992']) {
      expect(parseAssetAmount(bad, 0)).toBeNull();
    }
  });
});

describe('rawToDecimalString', () => {
  test('is the exact inverse of parseAssetAmount', () => {
    expect(rawToDecimalString(1, 8)).toBe('0.00000001');
    expect(rawToDecimalString(150, 2)).toBe('1.5');
    expect(rawToDecimalString(100, 2)).toBe('1');
    expect(rawToDecimalString(42, 0)).toBe('42');
    for (const raw of [1, 99, 123_456_789]) expect(parseAssetAmount(rawToDecimalString(raw, 6), 6)).toBe(raw);
  });
});

describe('errorText', () => {
  test('drops the "Error: " prefixes a relayed error picks up', () => {
    expect(errorText(new Error('Error: Server unreachable'))).toBe('Server unreachable');
    expect(errorText('plain text')).toBe('plain text');
  });
});

describe('formatCompactAssetAmount', () => {
  test('shortens large amounts with K, M, B and T', () => {
    expect(formatCompactAssetAmount(asset({ displayAmount: 836_393.97, decimals: 2 }))).toBe('836.39K');
    expect(formatCompactAssetAmount(asset({ displayAmount: 20_000 }))).toBe('20K');
    expect(formatCompactAssetAmount(asset({ displayAmount: 3_450_000 }))).toBe('3.45M');
    expect(formatCompactAssetAmount(asset({ displayAmount: 7_100_000_000 }))).toBe('7.1B');
    expect(formatCompactAssetAmount(asset({ displayAmount: 2_000_000_000_000 }))).toBe('2T');
  });

  test('cuts digits instead of rounding up, so the balance is never overstated', () => {
    expect(formatCompactAssetAmount(asset({ displayAmount: 999_999 }))).toBe('999.99K');
    expect(formatCompactAssetAmount(asset({ displayAmount: 0.9999999, decimals: 8 }))).toBe('0.999999');
  });

  test('keeps small amounts as they are, up to the asset decimals', () => {
    expect(formatCompactAssetAmount(asset({ displayAmount: 10.001, decimals: 3 }))).toBe('10.001');
    expect(formatCompactAssetAmount(asset({ displayAmount: 0.000196, decimals: 6 }))).toBe('0.000196');
    expect(formatCompactAssetAmount(asset({ displayAmount: 1 }))).toBe('1');
  });
});

describe('isAwaitingOnchainConfirmation', () => {
  test('only an unsettled onchain deposit is pending', () => {
    expect(isAwaitingOnchainConfirmation({ layer: 'onchain', status: 'pending' })).toBe(true);
    expect(isAwaitingOnchainConfirmation({ layer: 'ark', status: 'pending' })).toBe(false);
    expect(isAwaitingOnchainConfirmation({ layer: 'lightning', status: 'pending' })).toBe(false);
    expect(isAwaitingOnchainConfirmation({ layer: 'onchain', status: 'confirmed' })).toBe(false);
  });
});
