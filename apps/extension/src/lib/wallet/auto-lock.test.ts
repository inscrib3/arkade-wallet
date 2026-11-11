import { beforeEach, describe, expect, test } from 'bun:test';
import { AUTO_LOCK_ALARM_NAME, createAutoLockController } from './auto-lock.js';

// Intervals are captured instead of run, so each test fires ticks by hand.
let ticks: Array<() => Promise<void>>;
let alarmPending: boolean;
let alarmChecks: number;
let autoLock: ReturnType<typeof createAutoLockController>;

beforeEach(() => {
  ticks = [];
  alarmPending = false;
  alarmChecks = 0;
  autoLock = createAutoLockController({
    createAlarm: (name) => {
      if (name === AUTO_LOCK_ALARM_NAME) alarmPending = true;
    },
    clearAlarm: () => {
      alarmPending = false;
    },
    getAlarm: async () => {
      alarmChecks++;
      return alarmPending ? { name: AUTO_LOCK_ALARM_NAME } : undefined;
    },
    setInterval: (callback) => {
      ticks.push(async () => callback());
      return ticks.length as unknown as ReturnType<typeof globalThis.setInterval>;
    },
    clearInterval: (handle) => {
      ticks[Number(handle) - 1] = async () => {};
    },
  });
});

async function tick(): Promise<void> {
  for (const run of ticks) {
    await run();
  }
  await Promise.resolve();
}

function schedule(): void {
  autoLock.schedule();
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
    autoLock.cancel();
    await tick();
    expect(alarmChecks).toBe(0);
  });
});
