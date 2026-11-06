---
description: Connect to the injected Inscrib3 provider.
---

# Browser extension

The extension exposes the frozen `window.arkade` provider. It is the preferred integration path.

### Connect a user

Wait until the window `load` event before checking for `window.arkade`. The provider is injected asynchronously. Checking earlier can incorrectly report that the extension is unavailable.

Request `connect()` only after a user action, such as selecting **Connect wallet**. The wallet shows an approval request the first time an origin connects. The approval remains until the user disconnects the site or revokes it in **Settings → Connected sites**.

After approval, read the active Ark address with `getAccounts()` or `getAddress()`. Use `getNetwork()` to ensure the selected network is compatible with your application.

### Request wallet actions

Read methods require an unlocked wallet. Payment, asset transfer, settlement, and signature methods open a separate approval window for every request.

Treat the active wallet account and network as mutable. Subscribe to `accountsChanged`, `accountChanged`, and `networkChanged`. Refresh your application state when an event arrives.

A user can reject any approval. Handle promise rejections and show the user a clear retry path. Do not retry an approval automatically.

### Supported requests

The extension supports wallet connection, balance and asset reads, Ark payments, asset transfers, settlement, and BIP-322 message signatures. Ark payment destinations must use an Ark address.

{% content-ref url="dapp-integration.md" %}
[dapp-integration.md](dapp-integration.md)
{% endcontent-ref %}
