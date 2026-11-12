import { beforeEach, describe, expect, test } from 'bun:test';
import type { KeyValueStore } from '@inscrib3/core';
import { encodeBigints, decodeBigints } from './bigint-wire.js';

// A minimal fake of the WebExtension APIs the router touches. It must exist
// before the router module loads, which reads browser.runtime at import time.
type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
let messageListener: Listener;
let local: Map<string, unknown>;
let session: Map<string, unknown>;
let windowsOpened: string[];
let alarmsCreated: number;
let events: string[];
let windowRemovedListeners: Set<(windowId: number) => void>;
let store: KeyValueStore;

function area(map: () => Map<string, unknown>) {
  return {
    get: async (key: string) => ({ [key]: map().get(key) }),
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) map().set(k, v);
    },
  };
}

(globalThis as unknown as { browser: unknown }).browser = {
  runtime: {
    getURL: (path: string) => `chrome-extension://ext${path}`,
    onMessage: { addListener: (fn: Listener) => (messageListener = fn) },
    sendMessage: async (m: { event?: string }) => void (m?.event && events.push(m.event)),
    getManifest: () => ({ version: '1.0.0' }),
  },
  storage: { local: area(() => local), session: area(() => session) },
  alarms: { create: () => alarmsCreated++, clear: async () => true, get: async () => undefined, onAlarm: { addListener() {} } },
  tabs: { query: async () => [], sendMessage: async () => undefined },
  windows: {
    create: async ({ url }: { url: string }) => {
      windowsOpened.push(url);
      return { id: windowsOpened.length };
    },
    onRemoved: {
      addListener: (fn: (windowId: number) => void) => windowRemovedListeners.add(fn),
      removeListener: (fn: (windowId: number) => void) => windowRemovedListeners.delete(fn),
    },
  },
};

const { BackgroundRouter } = await import('./background-router.js');
const { isInternalSender, toRpcRequest } = await import('./protocol.js');

const DAPP = 'https://dapp.example';
const page = { origin: DAPP, url: `${DAPP}/app`, tab: { id: 1 } };
const internal = { origin: 'chrome-extension://ext', url: 'chrome-extension://ext/popup.html' };

const calls: string[] = [];
let activeAccount = { seedId: 0, index: 0 };
let unlocked = true;
let reconnectFails = false;
let sendArgs: unknown[] = [];
let storedOverview: Record<string, unknown> = {};
const manager = {
  onIncomingFunds: () => () => undefined,
  isUnlocked: () => unlocked,
  getAddress: async () => 'ark1address',
  getXOnlyPublicKey: async () => 'ab'.repeat(32),
  getBalance: async () => ({ total: 46_766n }),
  getTransactionHistory: async () => [{ txid: 'ark-tx', layer: 'ark' }],
  getStoredOverview: async () => storedOverview,
  exportMnemonic: async () => (calls.push('exportMnemonic'), 'seed words'),
  send: async (...args: unknown[]) => {
    calls.push('send');
    sendArgs = args;
    return 'txid';
  },
  signMessage: async (message: string) => (calls.push('signMessage'), { message, signature: 'sig', address: 'bc1p' }),
  reissueAsset: async () => (calls.push('reissueAsset'), 'reissue-tx'),
  burnAsset: async () => (calls.push('burnAsset'), 'burn-tx'),
  getActiveAccount: async () => activeAccount,
  listAccounts: async () => [{ seedId: 0, index: 0, label: 'Main' }],
  lock: async () => void calls.push('lock'),
  unlock: async () => {
    calls.push('unlock');
    unlocked = true;
  },
  reconnect: async () => {
    calls.push('reconnect');
    if (reconnectFails) throw new Error('SERVER_UNREACHABLE: down');
  },
};

function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => void map.set(key, value),
    clear: async () => void map.clear(),
  };
}

let nextId = 0;
function send(method: string, params: unknown, sender: unknown): Promise<{ result?: unknown; error?: string }> {
  return new Promise((resolve) => {
    messageListener({ id: `t-${++nextId}`, method, params }, sender, resolve as (r: unknown) => void);
  });
}

// Window ids are 1-based positions in windowsOpened.
function closeWindow(windowId: number): void {
  for (const listener of [...windowRemovedListeners]) listener(windowId);
}

async function waitForWindow(count: number): Promise<URL> {
  for (let i = 0; i < 100 && windowsOpened.length < count; i++) await new Promise((r) => setTimeout(r, 5));
  return new URL(windowsOpened[count - 1]);
}

function connect(origin: string): void {
  local.set('arkade:permissions:origins', { [origin]: { connectedAt: 1 } });
}

beforeEach(() => {
  // Approvals a test left open would count against the next test's per-site cap.
  windowsOpened?.forEach((_, index) => closeWindow(index + 1));
  local = new Map();
  session = new Map();
  windowsOpened = [];
  alarmsCreated = 0;
  events = [];
  windowRemovedListeners = new Set();
  reconnectFails = false;
  calls.length = 0;
  activeAccount = { seedId: 0, index: 0 };
  unlocked = true;
  storedOverview = {};
  store = memoryStore();
  new BackgroundRouter(manager as never, store).init();
});

describe('BackgroundRouter sender gating', () => {
  test('a web page cannot call internal wallet_* methods', async () => {
    connect(DAPP);
    const res = await send('wallet_exportMnemonic', { password: 'pw' }, page);
    expect(res.error).toMatch(/not available to web pages/);
    expect(calls).toEqual([]);
  });

  test('our own windows cannot call app methods', async () => {
    const res = await send('arkade_sendToAddress', { address: 'a', amount: 1 }, internal);
    expect(res.error).toMatch(/only available to web pages/);
  });

  test('an unknown method is rejected', async () => {
    expect((await send('wallet_doesNotExist', {}, internal)).error).toMatch(/Unknown method/);
  });
});

// Regression: a page could forge popup events (a fake "funds received") by
// sending an event-shaped object through content.ts.
describe('relayed page messages', () => {
  test('content.ts forwards only id, method and params', () => {
    const forged = { id: 'x', method: 'arkade_getBalance', params: [], _arkadeEvent: true, event: 'fundsReceived', data: { amountSats: 5_000_000 } };
    expect(toRpcRequest(forged)).toEqual({ id: 'x', method: 'arkade_getBalance', params: [] });
    expect(toRpcRequest({ _arkadeEvent: true, event: 'fundsReceived' })).toBeNull();
    expect(toRpcRequest('not an object')).toBeNull();
  });

  test('a message relayed from a page is not an internal sender; our own windows are', () => {
    expect(isInternalSender(page as never)).toBe(false);
    expect(isInternalSender(internal as never)).toBe(true);
  });
});

describe('BackgroundRouter unconnected origin', () => {
  test('reads refuse or return empty, and sends open no approval', async () => {
    expect((await send('arkade_getAddress', undefined, page)).error).toMatch(/Not connected/);
    expect((await send('arkade_getXOnlyPublicKey', undefined, page)).error).toMatch(/Not connected/);
    expect((await send('arkade_getAccounts', undefined, page)).result).toEqual([]);
    expect((await send('arkade_sendToAddress', { address: 'a', amount: 1 }, page)).error).toMatch(/Not connected/);
    expect(windowsOpened).toEqual([]);
    expect(calls).toEqual([]);
  });

  // Regression: a connected app polling a read kept the wallet unlocked forever.
  test('no web page extends auto-lock, connected or not; the wallet\'s own windows do', async () => {
    await send('arkade_isConnected', undefined, page);
    connect(DAPP);
    await send('arkade_getAddress', undefined, page);
    expect(alarmsCreated).toBe(0);
    await send('wallet_isUnlocked', undefined, internal);
    expect(alarmsCreated).toBe(1);
  });
});

describe('BackgroundRouter cached overview', () => {
  async function cachedOverview(): Promise<unknown> {
    return decodeBigints((await send('wallet_getCachedOverview', undefined, internal)).result);
  }

  test('serves the last fetched balance and history to a reopened popup', async () => {
    expect(await cachedOverview()).toEqual({});
    await send('wallet_getBalance', undefined, internal);
    await send('wallet_getTransactionHistory', undefined, internal);
    expect(await cachedOverview()).toEqual({
      balance: { total: 46_766n },
      history: [{ txid: 'ark-tx', layer: 'ark' }],
    });
  });

  test('forgets everything on lock', async () => {
    await send('wallet_getBalance', undefined, internal);
    await send('wallet_lock', undefined, internal);
    expect(await cachedOverview()).toEqual({});
  });

  test('serves nothing while locked', async () => {
    await send('wallet_getBalance', undefined, internal);
    unlocked = false;
    expect(await cachedOverview()).toBeNull();
  });

  test('never shows one account\'s data under another', async () => {
    await send('wallet_getBalance', undefined, internal);
    activeAccount = { seedId: 0, index: 1 };
    expect(await cachedOverview()).toEqual({});
  });

  // Right after unlock nothing was fetched yet: the SDK's saved coins fill in.
  test('falls back to the coins saved on this device, preferring this session\'s data', async () => {
    storedOverview = { balance: { total: 1n }, vtxos: [{ txid: 'saved' }] };
    expect(await cachedOverview()).toEqual(storedOverview);
    await send('wallet_getBalance', undefined, internal);
    expect(await cachedOverview()).toEqual({ balance: { total: 46_766n }, vtxos: [{ txid: 'saved' }] });
  });
});

describe('BackgroundRouter approvals', () => {
  test('signMessage rejects an over-long message without opening a window', async () => {
    connect(DAPP);
    const res = await send('arkade_signMessage', { message: 'x'.repeat(1025) }, page);
    expect(res.error).toMatch(/at most 1024/);
    expect(windowsOpened).toEqual([]);
  });

  test('signMessage only signs after approval, and the popup names network and account', async () => {
    connect(DAPP);
    const pending = send('arkade_signMessage', { message: 'hello' }, page);
    const url = await waitForWindow(1);
    expect(url.searchParams.get('origin')).toBe(DAPP);
    expect(url.searchParams.get('network')).toBe('Mainnet');
    expect(url.searchParams.get('account')).toBe('Main');
    expect(calls).toEqual([]);

    await send('approval_respond', { approvalId: url.searchParams.get('id'), approved: true }, internal);
    expect((await pending).result).toMatchObject({ signature: 'sig' });
    expect(calls).toEqual(['signMessage']);
  });

  test('a rejected send never reaches the wallet', async () => {
    connect(DAPP);
    const pending = send('arkade_sendToAddress', { address: 'ark1dest', amount: 1000 }, page);
    const url = await waitForWindow(1);
    await send('approval_respond', { approvalId: url.searchParams.get('id'), approved: false }, internal);
    expect((await pending).error).toMatch(/rejected/);
    expect(calls).toEqual([]);
  });

  test('reissuance and burn each require approval', async () => {
    connect(DAPP);
    const assetOperation = { assetId: 'a'.repeat(68), amount: 100 };

    const pendingReissue = send('arkade_reissueAsset', assetOperation, page);
    const reissueUrl = await waitForWindow(1);
    expect(reissueUrl.searchParams.get('type')).toBe('reissueAsset');
    expect(JSON.parse(reissueUrl.searchParams.get('assetOperation')!)).toEqual(assetOperation);
    await send('approval_respond', { approvalId: reissueUrl.searchParams.get('id'), approved: true }, internal);
    expect((await pendingReissue).result).toBe('reissue-tx');

    const pendingBurn = send('arkade_burnAsset', assetOperation, page);
    const burnUrl = await waitForWindow(2);
    expect(burnUrl.searchParams.get('type')).toBe('burnAsset');
    await send('approval_respond', { approvalId: burnUrl.searchParams.get('id'), approved: true }, internal);
    expect((await pendingBurn).result).toBe('burn-tx');
    expect(calls).toEqual(['reissueAsset', 'burnAsset']);
  });

  // Regression: the popup named one account, the send ran on whichever was
  // active when Approve was clicked.
  test('switching account while the popup is open cancels the approved send', async () => {
    connect(DAPP);
    const pending = send('arkade_sendToAddress', { address: 'ark1dest', amount: 1000 }, page);
    const url = await waitForWindow(1);
    activeAccount = { seedId: 0, index: 1 };
    await send('approval_respond', { approvalId: url.searchParams.get('id'), approved: true }, internal);
    expect((await pending).error).toMatch(/account or network changed/);
    expect(calls).toEqual([]);
  });

  test('an approval recovered after a restart is refused if the account changed', async () => {
    session.set('arkade:pending-approval-requests', {
      'recovered-1': { method: 'arkade_sendToAddress', params: { address: 'ark1dest', amount: 1000 }, origin: DAPP, walletKey: 'https://arkade.computer|0:0' },
    });
    activeAccount = { seedId: 1, index: 0 };
    const res = await send('approval_respond', { approvalId: 'recovered-1', approved: true }, internal);
    expect(res.error).toMatch(/account or network changed/);
    expect(calls).toEqual([]);
  });

  // Regression: approving a connect while locked errored, yet saved the
  // connection.
  test('while locked, a connect opens the unlock window; closing it connects nothing', async () => {
    unlocked = false;
    const pending = send('arkade_connect', undefined, page);
    const url = await waitForWindow(1);
    expect(url.searchParams.get('type')).toBe('unlock');
    closeWindow(1);
    expect((await pending).error).toMatch(/Wallet is locked/);
    expect(windowsOpened).toHaveLength(1);
    expect(local.get('arkade:permissions:origins')).toBeUndefined();
  });

  test('after unlocking, the locked connect continues to its own approval', async () => {
    unlocked = false;
    const pending = send('arkade_connect', undefined, page);
    await waitForWindow(1);
    await send('wallet_unlock', { password: 'pw' }, internal);
    const approval = await waitForWindow(2);
    expect(approval.searchParams.get('type')).toBe('connect');
    // Labels are read after unlock, so the approval names the real wallet.
    expect(approval.searchParams.get('account')).toBe('Main');
    await send('approval_respond', { approvalId: approval.searchParams.get('id'), approved: true }, internal);
    expect((await pending).result).toEqual(['ark1address']);
  });

  test('requests arriving while locked share one unlock window', async () => {
    unlocked = false;
    connect(DAPP);
    const first = send('arkade_connect', undefined, page);
    const second = send('arkade_connect', undefined, page);
    await waitForWindow(1);
    await send('wallet_unlock', { password: 'pw' }, internal);
    expect((await first).result).toEqual(['ark1address']);
    expect((await second).result).toEqual(['ark1address']);
    expect(windowsOpened).toHaveLength(1);
  });

  test('a connected site calling connect while locked gets the unlock window, not an error', async () => {
    unlocked = false;
    connect(DAPP);
    const pending = send('arkade_connect', undefined, page);
    expect((await waitForWindow(1)).searchParams.get('type')).toBe('unlock');
    await send('wallet_unlock', { password: 'pw' }, internal);
    expect((await pending).result).toEqual(['ark1address']);
  });

  test('a fourth open request from one site says why it was refused', async () => {
    connect(DAPP);
    for (let i = 1; i <= 3; i++) {
      void send('arkade_sendToAddress', { address: 'ark1dest', amount: i }, page);
      await waitForWindow(i);
    }
    const res = await send('arkade_sendToAddress', { address: 'ark1dest', amount: 4 }, page);
    expect(res.error).toMatch(/Too many Inscrib3 Wallet requests/);
    expect(windowsOpened).toHaveLength(3);
  });

  test('a page cannot answer its own approval', async () => {
    connect(DAPP);
    void send('arkade_sendToAddress', { address: 'ark1dest', amount: 1000 }, page);
    const url = await waitForWindow(1);
    const res = await send('approval_respond', { approvalId: url.searchParams.get('id'), approved: true }, page);
    expect(res.error).toMatch(/not available to web pages/);
    expect(calls).toEqual([]);
  });
});

describe('BackgroundRouter network switch', () => {
  const settings = { arkServerUrl: 'https://mutinynet.arkade.sh', esploraUrl: 'https://mutinynet.com/api' };

  test('reconnects with the cached password instead of locking', async () => {
    const res = await send('wallet_setNetworkSettings', settings, internal);
    expect(res.result).toBe(true);
    expect(calls).toEqual(['reconnect']);
    expect(events).not.toContain('lock');
    expect(events).toContain('networkChanged');
  });

  test('locks and reports when the new server is unreachable', async () => {
    reconnectFails = true;
    const res = await send('wallet_setNetworkSettings', settings, internal);
    expect(res.error).toMatch(/couldn't be reached/);
    expect(events).toContain('lock');
  });
});

describe('BackgroundRouter arkade_switchNetwork', () => {
  async function savedServer(): Promise<string | undefined> {
    return (await store.get<{ arkServerUrl: string }>('arkade:settings:network'))?.arkServerUrl;
  }

  test('an unconnected site cannot ask', async () => {
    expect((await send('arkade_switchNetwork', { network: 'mutinynet' }, page)).error).toMatch(/Not connected/);
    expect(windowsOpened).toEqual([]);
  });

  test('only preset networks are accepted, so a site cannot pick a server URL', async () => {
    connect(DAPP);
    const res = await send('arkade_switchNetwork', { network: 'https://evil.example' }, page);
    expect(res.error).toMatch(/Unknown network/);
    expect(windowsOpened).toEqual([]);
    expect(await savedServer()).toBeUndefined();
  });

  test('already on that network: nothing to approve', async () => {
    connect(DAPP);
    expect((await send('arkade_switchNetwork', { network: 'bitcoin' }, page)).result).toBe(true);
    expect(windowsOpened).toEqual([]);
  });

  test('approved: saves the preset, reconnects and tells every page', async () => {
    connect(DAPP);
    const pending = send('arkade_switchNetwork', { network: 'mutinynet' }, page);
    const url = await waitForWindow(1);
    expect(url.searchParams.get('type')).toBe('switchNetwork');
    expect(url.searchParams.get('targetNetwork')).toBe('Mutinynet (testnet)');
    expect(url.searchParams.get('network')).toBe('Mainnet');
    await send('approval_respond', { approvalId: url.searchParams.get('id'), approved: true }, internal);
    expect((await pending).result).toBe(true);
    expect(await savedServer()).toBe('https://mutinynet.arkade.sh');
    expect(calls).toEqual(['reconnect']);
    expect(events).toContain('networkChanged');
  });

  test('rejected: the network stays as it was', async () => {
    connect(DAPP);
    const pending = send('arkade_switchNetwork', { network: 'mutinynet' }, page);
    const url = await waitForWindow(1);
    await send('approval_respond', { approvalId: url.searchParams.get('id'), approved: false }, internal);
    expect((await pending).error).toMatch(/rejected the network switch/);
    expect(await savedServer()).toBeUndefined();
    expect(calls).toEqual([]);
  });
});

// Bigint values fail plain extension messaging with "Could not serialize message".
describe('BackgroundRouter bigint values', () => {
  test('a bigint result reaches the popup through JSON and decodes exactly', async () => {
    const res = await send('wallet_getBalance', undefined, internal);
    const wire = JSON.parse(JSON.stringify(res));
    expect(decodeBigints(wire.result)).toEqual({ total: 46_766n });
  });

  test('a bigint parameter from the popup arrives at the wallet as a bigint', async () => {
    const amount = 100_000_000_000_000_000_000n;
    const params = encodeBigints({ address: 'ark1address', amount });
    await send('wallet_send', JSON.parse(JSON.stringify(params)), internal);
    expect(sendArgs[1]).toBe(amount);
  });
});
