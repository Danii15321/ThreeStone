export const INITIAL_STONES = 0;

export interface StonesExchange {
  readonly delta: number;
  readonly loserAfter: number;
  readonly winnerAfter: number;
}

export function calculateStonesExchange(input: {
  readonly loserStones: number;
  readonly roundsPlayed: number;
  readonly winnerStones: number;
}): StonesExchange {
  assertInteger(input.loserStones, 'loserStones');
  assertInteger(input.winnerStones, 'winnerStones');
  if (!Number.isInteger(input.roundsPlayed) || input.roundsPlayed < 1) {
    throw new RangeError('roundsPlayed must be a positive integer.');
  }

  const expectedWinner = 1 / (1 + 10 ** ((input.loserStones - input.winnerStones) / 400));
  const roundFactor = Math.min(48, Math.max(12, Math.round(144 / input.roundsPlayed)));
  const rawDelta = Math.max(1, Math.round(roundFactor * (1 - expectedWinner)));

  return {
    delta: rawDelta,
    loserAfter: input.loserStones - rawDelta,
    winnerAfter: input.winnerStones + rawDelta,
  };
}

function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer.`);
  }
}
