import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey, networks, scriptExpressions } from '@bitcoinerlab/descriptors-scure';
import { DescriptorIdentity, MnemonicIdentity, type Identity } from '@arkade-os/sdk';

// The one key an account signs with and receives on (Ark, boarding and exit
// fees alike). The SDK runs in static mode, never rotating addresses, so it is
// the account number is the final, non-hardened address index.
export function accountKeyPath(isMainnet: boolean, accountIndex: number): string {
  const coinType = isMainnet ? 0 : 1;
  return `m/86'/${coinType}'/0'/0/${accountIndex}`;
}

export function legacyAccountKeyPath(isMainnet: boolean, accountIndex: number): string {
  const coinType = isMainnet ? 0 : 1;
  return `m/86'/${coinType}'/${accountIndex}'/0/0`;
}

// Materialize the SDK's standard m/86'/coin'/0'/0/* template at the requested
// final index. The hardened BIP86 account remains 0 for every wallet account.
export function deriveAccountDescriptor(mnemonic: string, isMainnet: boolean, accountIndex: number): string {
  const seed = mnemonicToSeedSync(mnemonic);
  const network = isMainnet ? networks.bitcoin : networks.testnet;
  const masterNode = HDKey.fromMasterSeed(seed, network.bip32);
  return scriptExpressions.trBIP32({ masterNode, network, account: 0, change: 0, index: accountIndex });
}

// The SDK's static wallet normally pins a mnemonic identity to descriptor
// index 0. DescriptorIdentity pins the same seed-backed signer to any concrete
// final index without moving the hardened BIP86 account segment.
export function deriveAccountIdentity(mnemonic: string, isMainnet: boolean, accountIndex: number): Identity {
  const base = MnemonicIdentity.fromMnemonic(mnemonic, { isMainnet });
  if (accountIndex === 0) return base;

  const descriptor = deriveAccountDescriptor(mnemonic, isMainnet, accountIndex);
  return new DescriptorIdentity({
    descriptor,
    base,
    signer: {
      signWithDescriptor: (requests) => base.signDescriptorTransactions(requests),
      signMessageWithDescriptor: (requestedDescriptor, message, signatureType) =>
        base.signDescriptorMessage(requestedDescriptor, message, signatureType),
    },
  });
}

// Compatibility for non-zero accounts created before the derivation fix.
export function deriveLegacyAccountIdentity(mnemonic: string, isMainnet: boolean, accountIndex: number): Identity {
  if (accountIndex === 0) return MnemonicIdentity.fromMnemonic(mnemonic, { isMainnet });
  const seed = mnemonicToSeedSync(mnemonic);
  const network = isMainnet ? networks.bitcoin : networks.testnet;
  const masterNode = HDKey.fromMasterSeed(seed, network.bip32);
  const descriptor = scriptExpressions.trBIP32({ masterNode, network, account: accountIndex, change: 0, index: '*' });
  return MnemonicIdentity.fromMnemonic(mnemonic, { descriptor });
}
