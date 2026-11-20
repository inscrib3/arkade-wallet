// Settlement intents the SDK left unfinished (audit O-12). The SDK persists
// each settle's intent and treats its coins as unspendable until the intent
// reaches a terminal state. A settle cut off mid-way (the wallet locked, the
// service worker stopped) leaves an intent that never gets there: the SDK's own
// boot reconciliation only clears one that was never submitted, has expired,
// or whose coins were spent. Its coins then read as "have 0" while the balance
// still shows them.
import { collectIntents, isTerminalIntentState, type ArkIntent, type ArkProvider, type IntentRepository, type VirtualCoin } from '@arkade-os/sdk';

// A live settle updates its intent at every batch step; one untouched this long
// has no process behind it any more.
export const STALE_INTENT_MS = 15 * 60_000;

export async function unfinishedIntents(repo: IntentRepository): Promise<ArkIntent[]> {
  return (await collectIntents(repo)).filter((i) => !isTerminalIntentState(i.state));
}

/**
 * Cancels every unfinished intent that has made no progress for STALE_INTENT_MS,
 * which frees its coins. Asks the server to drop it too, best effort: the server
 * forgets an intent on its own once it expires. Returns how many were released.
 */
export async function releaseStaleIntents(repo: IntentRepository, arkProvider: Pick<ArkProvider, 'deleteIntent'>, now: number): Promise<number> {
  let released = 0;
  for (const intent of await unfinishedIntents(repo)) {
    if (now - intent.updatedAt < STALE_INTENT_MS) continue;
    try {
      await arkProvider.deleteIntent({ proof: intent.deleteProof, message: JSON.parse(intent.deleteProofMessage) });
    } catch {
      // Already gone on the server, or unreachable: the local release still stands.
    }
    await repo.saveIntent({
      ...intent,
      state: 'cancelled',
      updatedAt: now,
      cancellationReason: `released by the wallet: no progress for ${STALE_INTENT_MS / 60_000} minutes`,
    });
    released++;
  }
  return released;
}

/**
 * Commitment txids of batches that only renewed this wallet's own coins. This
 * wallet joins a batch for two things: a settle, whose outputs all come back to
 * the wallet, and an offboard, which adds an onchain output. So an intent with
 * no onchain output was a renewal, and the sats it cost were the batch fee.
 * Only intents made on this device are stored, so others stay unknown.
 */
export async function renewalCommitmentTxids(repo: IntentRepository): Promise<Set<string>> {
  const txids = new Set<string>();
  for (const intent of await collectIntents(repo)) {
    if (intent.commitmentTransactionId && hasNoOnchainOutput(intent)) txids.add(intent.commitmentTransactionId);
  }
  return txids;
}

function hasNoOnchainOutput(intent: ArkIntent): boolean {
  try {
    const message: { onchain_output_indexes?: unknown } = JSON.parse(intent.registerProofMessage);
    return Array.isArray(message.onchain_output_indexes) && message.onchain_output_indexes.length === 0;
  } catch {
    return false;
  }
}

/** How much of one asset the unfinished intents hold, and when the oldest of them can be released. */
export function reservedAsset(
  intents: readonly ArkIntent[],
  vtxos: readonly VirtualCoin[],
  assetId: string,
): { amount: bigint; releasableAt: number } {
  const byOutpoint = new Map(vtxos.map((v) => [`${v.txid}:${v.vout}`, v]));
  let amount = 0n;
  let releasableAt = Infinity;
  for (const intent of intents) {
    let held = 0n;
    for (const o of intent.intentVtxos) {
      for (const a of byOutpoint.get(`${o.txid}:${o.vout}`)?.assets ?? []) if (a.assetId === assetId) held += a.amount;
    }
    if (held === 0n) continue;
    amount += held;
    releasableAt = Math.min(releasableAt, intent.updatedAt + STALE_INTENT_MS);
  }
  return { amount, releasableAt };
}
