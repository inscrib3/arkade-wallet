import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import type { KeyValueStore } from '@inscrib3/core';

type UpdateListener = (details: { version: string }) => void;

let manifest: Record<string, unknown>;
let updateListener: UpdateListener;
let githubRequests: number;
let store: KeyValueStore;

(globalThis as unknown as { browser: unknown }).browser = {
  runtime: {
    getManifest: () => manifest,
    onUpdateAvailable: { addListener: (listener: UpdateListener) => (updateListener = listener) },
  },
};
const { checkForNewVersion, checkForNewVersionIfDue, getVersionInfo, rememberDownloadedUpdates } = await import('./version-check.js');

const STORE_MANIFEST = { version: '1.0.0', update_url: 'https://clients2.google.com/service/update2/crx' };
const SIDELOADED_MANIFEST = { version: '1.0.0' };

// bun test shares globals and env between test files.
const realFetch = globalThis.fetch;

beforeAll(() => {
  process.env.WXT_RELEASES_REPO = 'o/r';
  globalThis.fetch = (async () => {
    githubRequests++;
    return new Response(JSON.stringify({ tag_name: '1.1.0', html_url: 'https://github.com/o/r/releases/tag/1.1.0' }));
  }) as unknown as typeof fetch;
});

afterAll(() => {
  delete process.env.WXT_RELEASES_REPO;
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  githubRequests = 0;
  const values = new Map<string, unknown>();
  store = {
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => void values.set(key, value),
  } as unknown as KeyValueStore;
});

describe('store install', () => {
  beforeEach(() => {
    manifest = STORE_MANIFEST;
    rememberDownloadedUpdates(store);
  });

  test('does not ask GitHub, since a release may still be in store review', async () => {
    await checkForNewVersion(store);
    expect(githubRequests).toBe(0);
    expect((await getVersionInfo(store)).updateAvailable).toBe(false);
  });

  test('offers a one-click install once Chrome has downloaded an update', async () => {
    updateListener({ version: '1.1.0' });
    const info = await getVersionInfo(store);
    expect(info).toMatchObject({ updateAvailable: true, latestVersion: '1.1.0', canInstallByReloading: true, releaseUrl: null });
  });

  test('ignores a GitHub release an older build cached, which a reload cannot install', async () => {
    manifest = SIDELOADED_MANIFEST;
    await checkForNewVersion(store);
    manifest = STORE_MANIFEST;
    expect((await getVersionInfo(store)).updateAvailable).toBe(false);
  });

  test('stops offering it once the update is installed', async () => {
    updateListener({ version: '1.1.0' });
    manifest = { ...STORE_MANIFEST, version: '1.1.0' };
    expect((await getVersionInfo(store)).updateAvailable).toBe(false);
  });
});

describe('sideloaded install', () => {
  beforeEach(() => {
    manifest = SIDELOADED_MANIFEST;
  });

  test('links to the GitHub release, since a reload cannot install it', async () => {
    await checkForNewVersion(store);
    const info = await getVersionInfo(store);
    expect(githubRequests).toBe(1);
    expect(info).toMatchObject({ updateAvailable: true, latestVersion: '1.1.0', canInstallByReloading: false });
    expect(info.releaseUrl).toContain('github.com');
  });

  describe('checking when the popup opens', () => {
    const START = new Date('2026-11-07T08:00:00Z');
    const FIFTY_NINE_MINUTES = 59 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;

    afterEach(() => setSystemTime());

    test('asks GitHub right away on the first open', async () => {
      setSystemTime(START);
      await checkForNewVersionIfDue(store);
      expect(githubRequests).toBe(1);
    });

    test('asks GitHub at most once an hour', async () => {
      setSystemTime(START);
      await checkForNewVersionIfDue(store);
      setSystemTime(new Date(START.getTime() + FIFTY_NINE_MINUTES));
      await checkForNewVersionIfDue(store);
      expect(githubRequests).toBe(1);
      setSystemTime(new Date(START.getTime() + ONE_HOUR));
      await checkForNewVersionIfDue(store);
      expect(githubRequests).toBe(2);
    });
  });
});
