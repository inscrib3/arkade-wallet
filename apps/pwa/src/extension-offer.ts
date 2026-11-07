export const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/hafphignbjdmblopkophkohgnphalclg';

const DISMISSED_KEY = 'inscrib3:extension-banner-dismissed';

export interface BrowserFacts {
  hasExtension: boolean;
  isDesktopChromium: boolean;
  dismissed: boolean;
}

export function shouldOfferExtension(facts: BrowserFacts): boolean {
  return facts.isDesktopChromium && !facts.hasExtension && !facts.dismissed;
}

// Only Chromium browsers expose userAgentData, and the Web Store extension
// installs on all of them (Chrome, Brave, Edge, Opera).
interface UserAgentData {
  brands: { brand: string }[];
  mobile: boolean;
}

// The extension injects window.arkade into every page, this one included.
// Its script is added at document_start and delays the load event, so read
// this after load.
export function readBrowserFacts(): BrowserFacts {
  const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  return {
    hasExtension: 'arkade' in window,
    isDesktopChromium: !!userAgentData && !userAgentData.mobile && userAgentData.brands.some((b) => b.brand === 'Chromium'),
    dismissed: readDismissed(),
  };
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Storage blocked: the banner just comes back next visit.
  }
}
