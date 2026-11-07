# App integration

A web page can talk to this wallet in two ways:

| | Browser extension | PWA popup |
|---|---|---|
| How | `window.arkade`, injected into every page | Open the PWA in a popup with URL parameters; it answers with `postMessage` |
| What you can do | Everything below | Connect, and send BTC to an Ark address |
| Use when | The user has the extension installed | Fallback when `window.arkade` is missing |

All amounts are **satoshis, as positive integers**. Sends go to **Ark addresses** only (`ark1…` on mainnet, `tark1…` on Mutinynet); onchain and Lightning destinations are not accepted from apps.

## Extension: `window.arkade`

The provider is frozen and can't be replaced by another script. It is added asynchronously: it is **not** there yet while your scripts first run or at `DOMContentLoaded`, only from the window's `load` event on. Check for it after `load`, or when the user clicks your connect button, never once at startup.

```js
function whenLoaded() {
  return document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
}

await whenLoaded();
if (!window.arkade?.isArkade) {
  // Not installed: fall back to the PWA popup (below) or ask the user to install it.
}

const [address] = await window.arkade.connect(); // opens the approval window once per origin
const network = await window.arkade.getNetwork();
if (network.network !== 'bitcoin') {
  // The user is on a testnet or a custom server; refuse or adapt.
}
const txid = await window.arkade.sendToAddress('ark1q…', 1000);
```

### Connection

Every method except `connect`, `disconnect`, `getAccounts`, `isConnected` and `getProviderState` rejects with `Not connected. Call connect() first.` until the user has approved your origin. The approval is remembered per origin until the user revokes it under Settings → Connected sites, or you call `disconnect()`.

The connection is to the wallet, not to one account: after the user switches account or network, the same calls return the new account's data, and `accountsChanged` tells you so.

### Methods

| Method | Returns | Approval window |
|---|---|---|
| `connect()` | `string[]`: the active Ark address | First time per origin |
| `disconnect()` | `true` | No |
| `isConnected()` | `boolean` | No |
| `getAccounts()` | `string[]`, empty if not connected or locked | No |
| `getProviderState()` | `{ isConnected, isUnlocked, network, accounts }` | No |
| `getAddress()` | Ark address | No |
| `getBoardingAddress()` | Onchain address that moves BTC into Ark | No |
| `getXOnlyPublicKey()` | Hex x-only public key of the Ark signing key | No |
| `getBalance()` | `BalanceInfo` (below) | No |
| `getNetwork()` | `NetworkInfo` (below) | No |
| `getAssets()` | `AssetInfo[]` (below) | No |
| `getTransactionHistory()` | `TxHistoryEntry[]` (below) | No |
| `sendToAddress(address, amount)` | txid | Every call |
| `sendAsset(address, assets, bitcoinAmount?)` | txid | Every call |
| `settle()` | txid of the batch the VTXOs were renewed in | Every call |
| `signMessage(message)` | `{ message, signature, address }` (BIP-322) | Every call |

Calls that read wallet data need the wallet unlocked and reject with `Wallet is locked` otherwise. Calls that open an approval window need it unlocked *before* the call: the window has no unlock step, so they reject straight away with `Wallet is locked. Open the extension, unlock it, then try again.`

#### `sendAsset`

```js
await window.arkade.sendAsset('ark1q…', [{ assetId: '…', amount: 500 }]);
```

`amount` is in the asset's raw units, without its decimals applied (`getAssets()` returns `metadata.decimals`). `bitcoinAmount` optionally sends sats in the same transaction.

#### `signMessage`

The message must be a non-empty string of at most 1,024 characters. The signature is BIP-322, made with the key behind the returned `address` (the account's BIP86 Taproot address, `bc1p…` / `tb1p…`), so any BIP-322 verifier can check it.

### Return types

```ts
interface ProviderState {
  isConnected: boolean;
  isUnlocked: boolean;
  network: string | null; // null when not connected
  accounts: string[];
}

interface NetworkInfo {
  network: 'bitcoin' | 'mutinynet' | 'custom';
  displayName: string;
  isTestnet: boolean; // true for anything but the mainnet preset
  arkServerUrl: string;
  esploraUrl: string;
}

interface BalanceInfo {
  available: number; // spendable now
  total: number;
  vtxo: { confirmed: number; unconfirmed: number; total: number }; // settled / preconfirmed
  boarding: { confirmed: number; unconfirmed: number; total: number }; // onchain, not yet in Ark
}

interface AssetInfo {
  assetId: string;
  amount: number; // raw units
  displayAmount: number; // amount with decimals applied
  genesisTxid: string;
  metadata?: { name?: string; ticker?: string; decimals?: number; icon?: string };
}

interface TxHistoryEntry {
  txid: string; // often an offchain Ark txid that block explorers don't know
  type: 'send' | 'receive';
  amount: number;
  status: 'confirmed' | 'pending';
  timestamp: number;
  layer: 'ark' | 'onchain' | 'lightning';
  onchainTxid?: string; // the L1 txid, when there is one
  assets?: { assetId: string; amount: number; isMint?: boolean }[]; // raw units
}
```

### Events

```js
window.arkade.on('accountsChanged', (accounts) => { /* string[], empty after a disconnect */ });
window.arkade.off('accountsChanged', handler);
```

| Event | Payload | When |
|---|---|---|
| `accountsChanged` | `string[]` | Your origin connected, disconnected, or the active address changed (account or network switch). Only sent to your origin. |
| `accountChanged` | none | The active account changed; refetch what you show. |
| `networkChanged` | `'bitcoin' \| 'mutinynet' \| 'custom'` | The user switched network. |
| `lock` / `unlock` | none | The wallet locked (manually or by auto-lock) or unlocked. |

### Errors

Every method returns a promise that rejects with an `Error`. Messages you can match on:

| Message | Cause |
|---|---|
| `Not connected. Call connect() first.` | Your origin isn't approved yet |
| `User rejected the connection request` / `User rejected the transaction` / `User rejected the signature request` / `User rejected the settlement` | The user clicked Reject or closed the window, or your origin already has 3 approval windows open |
| `Wallet is locked. Open the extension, unlock it, then try again.` | Approval call while locked |
| `The active account or network changed while this request was open, so nothing was done. Ask the site to try again.` | The user switched account or network while the approval window was open |
| `Invalid amount: must be a positive integer` | Amount is zero, negative or has decimals |

Server-side errors (insufficient funds, amount below the server's minimum, and so on) are passed through as their message text.

## PWA popup

Without the extension, open the PWA in a popup. The PWA identifies you by `document.referrer`, so open it with `window.open` and **without** `noopener` or `noreferrer`: with no referrer the PWA refuses the request.

```js
const WALLET_ORIGIN = 'https://wallet.example.com'; // the deployed PWA

function walletPopup(params) {
  const url = `${WALLET_ORIGIN}/?${new URLSearchParams(params)}`;
  const popup = window.open(url, 'inscrib3-wallet', 'width=380,height=640');
  return new Promise((resolve, reject) => {
    function onMessage(event) {
      if (event.origin !== WALLET_ORIGIN || event.source !== popup) return;
      cleanup();
      resolve(event.data);
    }
    const closedPoll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Wallet window closed'));
      }
    }, 500);
    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearInterval(closedPoll);
    }
    window.addEventListener('message', onMessage);
  });
}

// Connect: the parameter's value is ignored, the referrer decides the origin.
const { accounts } = await walletPopup({ arkade_connect_origin: '1' });

// Send
const reply = await walletPopup({ arkade_send_origin: '1', arkade_send_address: 'ark1q…', arkade_send_amount: '1000' });
```

Always check `event.origin` against the PWA's origin: any page can `postMessage` to yours.

The popup asks the user to unlock (or create a wallet) if needed, shows the request, and posts one of these back to your origin before closing itself:

| `event.data.type` | Extra fields | Meaning |
|---|---|---|
| `inscrib3:connect` | `accounts: string[]` | Approved |
| `inscrib3:connect_rejected` | | User rejected |
| `inscrib3:send` | `txid` | Sent |
| `inscrib3:send_failed` | `error` | Approved, but the send failed |
| `inscrib3:send_rejected` | | User rejected |

If the user closes the window instead, no message arrives: the `popup.closed` check above covers that.

The PWA keeps its wallet in its own origin's storage, separate from the extension's: a user can have different wallets in each.
