import { describe, expect, it } from 'vitest';

import type { TerminalResultRepository } from './terminal-result-repository.js';
import { RetryingTerminalResultRepository } from './terminal-result-retrier.js';

const result = {
  completedAt: new Date('2026-07-30T20:00:00.000Z'),
  gameId: '38e19266-142d-4804-8df0-4ee4cc83ea65',
  initialInitiative: 'player-one' as const,
  participants: [
    {
      finalReserve: 0,
      outcome: 'win' as const,
      seat: 'player-one' as const,
      userId: 'user-one',
    },
    {
      finalReserve: 2,
      outcome: 'loss' as const,
      seat: 'player-two' as const,
      userId: 'user-two',
    },
  ] as const,
  protocolVersion: 2,
  rounds: [],
  rulesVersion: '1.0.0',
  seed: 47,
  terminalReason: 'reserve-empty' as const,
  winner: 'player-one' as const,
};

describe('RetryingTerminalResultRepository', () => {
  it('acknowledges a transient failure and retries the idempotent result', async () => {
    let attempts = 0;
    const scheduled: Array<() => void> = [];
    let failures = 0;
    const inner: TerminalResultRepository = {
      async save() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('database unavailable');
        }
        return { kind: 'created' };
      },
    };
    const repository = new RetryingTerminalResultRepository(inner, {
      onFailure: () => {
        failures += 1;
      },
      schedule(_delayMs, task) {
        scheduled.push(task);
        return () => undefined;
      },
    });

    await expect(repository.save(result, result.completedAt)).resolves.toEqual({
      kind: 'created',
    });
    expect(repository.pendingCount).toBe(1);
    expect(failures).toBe(1);

    scheduled[0]?.();
    await expect.poll(() => repository.pendingCount).toBe(0);
    expect(attempts).toBe(2);
  });

  it('flushes pending results once before shutdown and stops retry timers', async () => {
    let available = false;
    let cancelled = false;
    const repository = new RetryingTerminalResultRepository(
      {
        async save() {
          if (!available) {
            throw new Error('database unavailable');
          }
          return { kind: 'existing' };
        },
      },
      {
        schedule() {
          return () => {
            cancelled = true;
          };
        },
      },
    );
    await repository.save(result, result.completedAt);

    available = true;
    await expect(repository.flush()).resolves.toEqual({ pending: 0 });

    expect(cancelled).toBe(true);
    expect(repository.pendingCount).toBe(0);
  });
});
