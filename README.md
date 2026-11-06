---
description: A non-custodial Ark wallet for Bitcoin applications.
---

# Inscrib3

Inscrib3 is a non-custodial Bitcoin wallet for the [Ark protocol](https://arkadeos.com/). It gives Bitcoin applications a wallet interface through a browser extension and a progressive web app (PWA).

> **Experimental — use at your own risk.** This is early software that moves real Bitcoin. No warranties, no guaranteed support. Don't put in more than you can afford to lose.

## What Inscrib3 supports

Wallet keys remain on the user's device. Applications request access and every spend, asset transfer, settlement, or message signature requires user approval.

Inscrib3 currently supports:

* Ark Bitcoin balances and Ark assets
* Lightning swaps and on-chain boarding
* Multiple accounts, network settings, and auto-lock
* A browser-extension provider for web applications
* A PWA popup flow when the extension is unavailable

## Integrate the wallet

Use the browser extension whenever it is installed. It injects the `window.arkade` provider into the application page.

Use the PWA popup as a fallback. The PWA receives a requested connection or Ark payment, then returns the result with `postMessage`.

Start with [docs](docs/ "mention") for the integration model and implementation paths.

## Current direction

Inscrib3 is building a wallet that applications can use without holding user keys. The extension provides the best connected experience. The PWA keeps a no-extension path available for compatible connection and payment requests.
