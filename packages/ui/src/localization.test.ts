import { describe, expect, test } from 'bun:test';
import { detectWalletLanguage, resolveWalletLanguage } from './localization.js';

describe('wallet localization', () => {
  test('detects every Chinese browser locale as Simplified Chinese UI', () => {
    expect(detectWalletLanguage(['zh-CN', 'en-US'])).toBe('zh-CN');
    expect(detectWalletLanguage(['zh-TW'])).toBe('zh-CN');
    expect(detectWalletLanguage(['zh-HK'])).toBe('zh-CN');
  });

  test('uses only the primary browser language', () => {
    expect(detectWalletLanguage(['en-US', 'zh-CN'])).toBe('en');
    expect(detectWalletLanguage([])).toBe('en');
  });

  test('manual preference overrides browser detection', () => {
    expect(resolveWalletLanguage('en', ['zh-CN'])).toBe('en');
    expect(resolveWalletLanguage('zh-CN', ['en-US'])).toBe('zh-CN');
    expect(resolveWalletLanguage('system', ['zh-CN'])).toBe('zh-CN');
  });
});
