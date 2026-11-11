// Alarms survive MV3 service-worker suspension; setTimeout would not.

export const AUTO_LOCK_ALARM_NAME = 'arkade-auto-lock';
const AUTO_LOCK_MINUTES = 60;

// Chrome stops a worker after ~30s without events, and the unlocked wallet
// lives only in its memory. Any extension API call resets that idle timer.
const KEEP_ALIVE_INTERVAL_MS = 20_000;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

export function scheduleAutoLock(): void {
  browser.alarms.create(AUTO_LOCK_ALARM_NAME, { delayInMinutes: AUTO_LOCK_MINUTES });
  keepWorkerAliveUntilAutoLock();
}

export function cancelAutoLock(): void {
  stopKeepAlive();
  void browser.alarms.clear(AUTO_LOCK_ALARM_NAME);
}

// A pending auto-lock alarm means the wallet is unlocked. Checking for it is
// itself the API call that keeps the worker alive, and once it has fired or
// been cleared the worker is allowed to stop again.
function keepWorkerAliveUntilAutoLock(): void {
  if (keepAliveTimer) return;
  keepAliveTimer = globalThis.setInterval(async () => {
    const autoLockPending = await browser.alarms.get(AUTO_LOCK_ALARM_NAME);
    if (!autoLockPending) stopKeepAlive();
  }, KEEP_ALIVE_INTERVAL_MS);
}

function stopKeepAlive(): void {
  if (!keepAliveTimer) return;
  globalThis.clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}
