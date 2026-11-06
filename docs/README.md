---
description: Connect a web application to the Inscrib3 wallet.
---

# Wallet integration

Inscrib3 supports two integration paths.

Use the browser extension when it is available. It injects the `window.arkade` provider and supports the complete wallet API.

Use the PWA popup when the extension is unavailable. It supports connection and Ark payments through a separate wallet origin.

### Choose an integration path

| Path              | Use it when                     | Capabilities                                                                   |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Browser extension | The user has Inscrib3 installed | Connection, wallet data, Ark payments, assets, settlement, and BIP-322 signing |
| PWA popup         | The extension is unavailable    | Connection and Ark payments                                                    |

Amounts use positive integer satoshis. Application-initiated payments accept Ark addresses only.

{% hint style="warning" %}
Always request a connection from a user action. Do not request it during page load.
{% endhint %}

Follow the browser extension path first. Detect the provider after the page `load` event or when the user selects **Connect wallet**. Use the PWA only if the provider is absent.

{% content-ref url="dapp-integration.md" %}
[dapp-integration.md](dapp-integration.md)
{% endcontent-ref %}
