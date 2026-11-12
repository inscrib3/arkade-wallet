// After a send, burn or reissue the SDK learns about the new coin from the
// server a moment after the call returns, so a balance read right away is
// still the old one. This re-reads until the change shows. A deadline, not an
// attempt count: each read is an indexer sync that can take 20+ s.
const RECHECK_PAUSE_MS = 1_500;
const RECHECK_DEADLINE_MS = 60_000;

export interface RecheckOptions {
  isCancelled?: () => boolean;
  pauseMs?: number;
  deadlineMs?: number;
}

// Returns true once `isDone` does, false when the deadline or a cancel ends it.
export async function recheckUntil(isDone: () => Promise<boolean>, options: RecheckOptions = {}): Promise<boolean> {
  const pauseMs = options.pauseMs ?? RECHECK_PAUSE_MS;
  const deadline = Date.now() + (options.deadlineMs ?? RECHECK_DEADLINE_MS);
  while (Date.now() < deadline) {
    if (options.isCancelled?.()) return false;
    if (await isDone()) return true;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return false;
}
