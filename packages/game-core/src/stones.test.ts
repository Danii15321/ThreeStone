import { describe, expect, it } from 'vitest';

import { INITIAL_STONES, calculateStonesExchange } from './stones.js';

describe('Stones', () => {
  it('starts every player at zero Stones', () => {
    expect(INITIAL_STONES).toBe(0);
  });

  it('transfers more Stones after a short duel than after a long duel', () => {
    const shortDuel = calculateStonesExchange({
      loserStones: 0,
      roundsPlayed: 3,
      winnerStones: 0,
    });
    const longDuel = calculateStonesExchange({
      loserStones: 0,
      roundsPlayed: 12,
      winnerStones: 0,
    });

    expect(shortDuel.delta).toBe(24);
    expect(longDuel.delta).toBe(6);
    expect(shortDuel.delta).toBeGreaterThan(longDuel.delta);
  });

  it('rewards an upset more than an expected victory', () => {
    const upset = calculateStonesExchange({
      loserStones: 300,
      roundsPlayed: 5,
      winnerStones: -200,
    });
    const expectedVictory = calculateStonesExchange({
      loserStones: -200,
      roundsPlayed: 5,
      winnerStones: 300,
    });

    expect(upset.delta).toBeGreaterThan(expectedVictory.delta);
  });

  it('is zero-sum and lets a losing player fall below zero', () => {
    const exchange = calculateStonesExchange({
      loserStones: 0,
      roundsPlayed: 1,
      winnerStones: 0,
    });

    expect(exchange.delta).toBe(24);
    expect(exchange.winnerAfter).toBe(24);
    expect(exchange.loserAfter).toBe(-24);
  });

  it('rejects invalid inputs instead of corrupting a rating', () => {
    expect(() =>
      calculateStonesExchange({
        loserStones: 0,
        roundsPlayed: 0,
        winnerStones: 0,
      }),
    ).toThrow(RangeError);
  });
});
