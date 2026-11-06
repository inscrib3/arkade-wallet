---
description: Use the Inscrib3 PWA when the extension is unavailable.
---

# PWA popup

Use the PWA popup only when `window.arkade` is unavailable. It provides connection and Ark payment flows without requiring the browser extension.

### Open the wallet

Open the deployed PWA with `window.open`. Do not use `noopener` or `noreferrer`. The PWA uses `document.referrer` to identify the requesting application and rejects requests without it.

Pass the documented connection or payment parameters in the popup URL. Keep a reference to the opened window. Listen for `message` events on the requesting window.

### Verify every result

Accept a message only when both values match:

* `event.origin` is the deployed PWA origin.
* `event.source` is the popup window that your application opened.

Handle a closed popup as a cancelled request. The PWA sends a rejection result when the user explicitly rejects a request. It sends no message when the window closes.

### PWA behavior

The PWA asks the user to create or unlock its wallet, then displays the request for approval. It returns the approved or rejected result with `postMessage` and closes.

The PWA wallet and extension wallet use separate browser storage. A user can have different wallets in each surface.

{% content-ref url="dapp-integration.md" %}
[dapp-integration.md](dapp-integration.md)
{% endcontent-ref %}
