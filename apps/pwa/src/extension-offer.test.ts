import { describe, expect, test } from 'bun:test';
import { shouldOfferExtension, type BrowserFacts } from './extension-offer.js';

const desktopChromeWithoutExtension: BrowserFacts = { hasExtension: false, isDesktopChromium: true, dismissed: false };

describe('shouldOfferExtension', () => {
  test('offers the extension on desktop Chromium without it installed', () => {
    expect(shouldOfferExtension(desktopChromeWithoutExtension)).toBe(true);
  });

  test('stays hidden when the extension is already installed', () => {
    expect(shouldOfferExtension({ ...desktopChromeWithoutExtension, hasExtension: true })).toBe(false);
  });

  test('stays hidden on phones and non-Chromium browsers', () => {
    expect(shouldOfferExtension({ ...desktopChromeWithoutExtension, isDesktopChromium: false })).toBe(false);
  });

  test('stays hidden once dismissed', () => {
    expect(shouldOfferExtension({ ...desktopChromeWithoutExtension, dismissed: true })).toBe(false);
  });
});
