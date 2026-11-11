// Alarms survive MV3 service-worker suspension; setTimeout would not.

export const AUTO_LOCK_ALARM_NAME = 'arkade-auto-lock';
const AUTO_LOCK_MINUTES = 60;

// Chrome stops a worker after ~30s without events, and the unlocked wallet
// lives only in its memory. Any extension API call resets that idle timer.
const KEEP_ALIVE_INTERVAL_MS = 20_000;

type TimerHandle = ReturnType<typeof globalThis.setInterval>;

interface AutoLockDependencies {
  createAlarm(name: string, delayInMinutes: number): void;
  clearAlarm(name: string): void;
  getAlarm(name: string): Promise<unknown>;
  setInterval(callback: () => void, delay: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

export function createAutoLockController(dependencies: AutoLockDependencies): {
  schedule: () => void;
  cancel: () => void;
} {
  let keepAliveTimer: TimerHandle | null = null;

  function stopKeepAlive(): void {
    if (!keepAliveTimer) return;
    dependencies.clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  // A pending auto-lock alarm means the wallet is unlocked. Checking for it is
  // itself the API call that keeps the worker alive, and once it has fired or
  // been cleared the worker is allowed to stop again.
  function keepWorkerAliveUntilAutoLock(): void {
    if (keepAliveTimer) return;
    keepAliveTimer = dependencies.setInterval(() => {
      void dependencies.getAlarm(AUTO_LOCK_ALARM_NAME).then((autoLockPending) => {
        if (!autoLockPending) stopKeepAlive();
      });
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  return {
    schedule: () => {
      dependencies.createAlarm(AUTO_LOCK_ALARM_NAME, AUTO_LOCK_MINUTES);
      keepWorkerAliveUntilAutoLock();
    },
    cancel: () => {
      stopKeepAlive();
      dependencies.clearAlarm(AUTO_LOCK_ALARM_NAME);
    },
  };
}

const autoLock = createAutoLockController({
  createAlarm: (name, delayInMinutes) => browser.alarms.create(name, { delayInMinutes }),
  clearAlarm: (name) => void browser.alarms.clear(name),
  getAlarm: (name) => browser.alarms.get(name),
  setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
  clearInterval: (handle) => globalThis.clearInterval(handle),
});

export function scheduleAutoLock(): void {
  autoLock.schedule();
}

export function cancelAutoLock(): void {
  autoLock.cancel();
}
