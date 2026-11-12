import { describe, expect, test } from 'bun:test';
import { recheckUntil } from './recheck.js';

describe('recheckUntil', () => {
  test('stops as soon as the check passes', async () => {
    let reads = 0;
    const done = await recheckUntil(async () => ++reads === 3, { pauseMs: 1 });
    expect(done).toBe(true);
    expect(reads).toBe(3);
  });

  test('gives up at the deadline', async () => {
    const done = await recheckUntil(async () => false, { pauseMs: 1, deadlineMs: 20 });
    expect(done).toBe(false);
  });

  test('stops without reading again once cancelled', async () => {
    let reads = 0;
    let cancelled = false;
    const done = await recheckUntil(
      async () => {
        reads++;
        cancelled = true;
        return false;
      },
      { pauseMs: 1, isCancelled: () => cancelled },
    );
    expect(done).toBe(false);
    expect(reads).toBe(1);
  });
});
