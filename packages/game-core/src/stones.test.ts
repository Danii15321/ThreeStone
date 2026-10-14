import { describe, expect, it } from 'vitest';

import {
  INITIAL_STONES,
  calculateStonesExchange,
  calculateStonesRewards,
  getStonesClass,
} from './stones.js';

type Seat = 'player-one' | 'player-two';

interface RewardRound {
  readonly choices: Readonly<Record<Seat, number>>;
  readonly predictions: Readonly<Record<Seat, number>>;
  readonly reservesAfter: Readonly<Record<Seat, number>>;
  readonly total: number;
  readonly winner: Seat | null;
}

function rewardRound(input: {
  readonly choiceOne?: number;
  readonly choiceTwo?: number;
  readonly reserveOne?: number;
  readonly reserveTwo?: number;
  readonly winner: Seat | null;
}): RewardRound {
  const predictionOne = input.winner === 'player-one' ? 1 : 2;
  const predictionTwo = input.winner === 'player-two' ? 1 : 2;
  return {
    choices: {
      'player-one': input.choiceOne ?? 1,
      'player-two': input.choiceTwo ?? 1,
    },
    predictions: {
      'player-one': predictionOne,
      'player-two': predictionTwo,
    },
    reservesAfter: {
      'player-one': input.reserveOne ?? 2,
      'player-two': input.reserveTwo ?? 2,
    },
    total: 1,
    winner: input.winner,
  };
}

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

  it.each([
    { expected: 'B', stones: -10_000 },
    { expected: 'B', stones: 99 },
    { expected: 'A', stones: 100 },
    { expected: 'A', stones: 499 },
    { expected: 'S', stones: 500 },
    { expected: 'S', stones: 10_000 },
  ] as const)('assigns $stones Stones to class $expected', ({ expected, stones }) => {
    expect(getStonesClass(stones)).toBe(expected);
  });

  it('awards three Stones per Main de pierre and caps it at four occurrences', () => {
    const rewards = calculateStonesRewards({
      rounds: [
        rewardRound({ choiceOne: 0, winner: 'player-one' }),
        rewardRound({ winner: null }),
        rewardRound({ choiceOne: 0, winner: 'player-one' }),
        rewardRound({ winner: null }),
        rewardRound({ choiceOne: 0, winner: 'player-one' }),
        rewardRound({ winner: null }),
        rewardRound({ choiceOne: 0, winner: 'player-one' }),
        rewardRound({ winner: null }),
        rewardRound({ choiceOne: 0, winner: 'player-one' }),
      ],
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    });

    expect(rewards['player-one']).toMatchObject({
      mainDePierreOccurrences: 4,
      mainDePierreStones: 12,
      total: 12,
    });
    expect(rewards['player-two']).toMatchObject({
      mainDePierreOccurrences: 0,
      mainDePierreStones: 0,
    });
  });

  it('awards one Oeil en pierre after three exact predictions in consecutive rounds', () => {
    const rewards = calculateStonesRewards({
      rounds: [
        rewardRound({ winner: 'player-one' }),
        rewardRound({ winner: 'player-one' }),
        rewardRound({ winner: 'player-one' }),
        rewardRound({ winner: 'player-one' }),
      ],
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    });

    expect(rewards['player-one']).toMatchObject({
      oeilEnPierre: true,
      oeilEnPierreStones: 9,
      total: 9,
    });
  });

  it('breaks the Oeil en pierre streak on an incorrect or unresolved round', () => {
    const rewards = calculateStonesRewards({
      rounds: [
        rewardRound({ winner: 'player-one' }),
        rewardRound({ winner: 'player-one' }),
        rewardRound({ winner: null }),
        rewardRound({ winner: 'player-one' }),
      ],
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    });

    expect(rewards['player-one']).toMatchObject({
      oeilEnPierre: false,
      oeilEnPierreStones: 0,
      total: 0,
    });
  });

  it('awards Coeur de pierre to a normal winner previously led three reserves to one', () => {
    const rewards = calculateStonesRewards({
      rounds: [
        rewardRound({ reserveOne: 3, reserveTwo: 1, winner: 'player-two' }),
        rewardRound({ reserveOne: 2, reserveTwo: 1, winner: 'player-one' }),
        rewardRound({ reserveOne: 1, reserveTwo: 1, winner: 'player-one' }),
        rewardRound({ reserveOne: 0, reserveTwo: 1, winner: 'player-one' }),
      ],
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    });

    expect(rewards['player-one']).toMatchObject({
      coeurDePierre: true,
      coeurDePierreStones: 6,
      oeilEnPierre: true,
      total: 15,
    });
  });

  it.each(['abandon', 'disconnect', 'hidden-choice-timeout', 'prediction-timeout'] as const)(
    'does not award Coeur de pierre after a %s victory',
    (terminalReason) => {
      const rewards = calculateStonesRewards({
        rounds: [rewardRound({ reserveOne: 3, reserveTwo: 1, winner: 'player-two' })],
        terminalReason,
        winner: 'player-one',
      });

      expect(rewards['player-one']).toMatchObject({
        coeurDePierre: false,
        coeurDePierreStones: 0,
      });
    },
  );

  it('does not award Coeur de pierre for any lead other than exactly three to one', () => {
    const rewards = calculateStonesRewards({
      rounds: [
        rewardRound({ reserveOne: 2, reserveTwo: 1, winner: 'player-two' }),
        rewardRound({ reserveOne: 0, reserveTwo: 1, winner: 'player-one' }),
      ],
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    });

    expect(rewards['player-one']).toMatchObject({
      coeurDePierre: false,
      coeurDePierreStones: 0,
    });
  });
});
