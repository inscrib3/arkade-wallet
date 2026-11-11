import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AUTO_LOCK_ALARM_NAME, scheduleAutoLock, cancelAutoLock } from './auto-lock.js';

// Intervals are captured instead of run, so each test fires ticks by hand.
let ticks: Array<() => Promise<void>>;
let alarmPending: boolean;
let alarmChecks: number;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

function installBrowserMock(): void {
  (globalThis as unknown as { browser: unknown }).browser = {
    alarms: {
      create: (name: string) => {
        if (name === AUTO_LOCK_ALARM_NAME) alarmPending = true;
      },
      clear: async () => {
        alarmPending = false;
        return true;
      },
      get: async () => {
        alarmChecks++;
        return alarmPending ? { name: AUTO_LOCK_ALARM_NAME } : undefined;
      },
    },
  };
}

beforeEach(() => {
  ticks = [];
  alarmPending = false;
  alarmChecks = 0;
  (globalThis as unknown as { setInterval: unknown }).setInterval = (fn: () => Promise<void>) => ticks.push(fn);
  (globalThis as unknown as { clearInterval: unknown }).clearInterval = (handle: number) => {
    ticks[handle - 1] = async () => {};
  };
  installBrowserMock();
});

afterEach(() => {
  cancelAutoLock();
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
});

async function tick(): Promise<void> {
  for (const run of ticks) {
    installBrowserMock();
    await run();
  }
}

function schedule(): void {
  installBrowserMock();
  scheduleAutoLock();
}

describe('extension auto-lock keepalive', () => {
  // Regression: Chrome stopped the idle worker about a minute after unlock,
  // wiping the in-memory wallet long before the auto-lock alarm.
  test('keeps calling the extension API while the auto-lock alarm is pending', async () => {
    schedule();
    await tick();
    await tick();
    expect(alarmChecks).toBe(2);
  });

  test('activity reschedules the alarm without starting a second keepalive', () => {
    schedule();
    schedule();
    expect(ticks.length).toBe(1);
  });

  test('stops once the alarm has fired, so a locked worker can be stopped', async () => {
    schedule();
    alarmPending = false;
    await tick();
    await tick();
    expect(alarmChecks).toBe(1);
  });

  test('stops when the wallet is locked by hand', async () => {
    schedule();
    cancelAutoLock();
    await tick();
    expect(alarmChecks).toBe(0);
  });
});
