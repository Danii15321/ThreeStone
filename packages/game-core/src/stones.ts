export const INITIAL_STONES = 0;

export type StonesClass = 'A' | 'B' | 'S';
export type StonesSeat = 'player-one' | 'player-two';

export interface StonesRewardRound {
  readonly choices: Readonly<Record<StonesSeat, number>>;
  readonly predictions: Readonly<Record<StonesSeat, number>>;
  readonly reservesAfter: Readonly<Record<StonesSeat, number>>;
  readonly total: number;
  readonly winner: StonesSeat | null;
}

export interface PlayerStonesRewards {
  readonly coeurDePierre: boolean;
  readonly coeurDePierreStones: number;
  readonly mainDePierreOccurrences: number;
  readonly mainDePierreStones: number;
  readonly oeilEnPierre: boolean;
  readonly oeilEnPierreStones: number;
  readonly total: number;
}

export interface StonesRewardInput {
  readonly rounds: readonly StonesRewardRound[];
  readonly terminalReason:
    'reserve-empty' | 'hidden-choice-timeout' | 'prediction-timeout' | 'abandon' | 'disconnect';
  readonly winner: StonesSeat;
}

const MAIN_DE_PIERRE_STONES = 3;
const MAIN_DE_PIERRE_CAP = 4;
const OEIL_EN_PIERRE_STONES = 9;
const COEUR_DE_PIERRE_STONES = 6;

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

export function getStonesClass(stones: number): StonesClass {
  assertInteger(stones, 'stones');
  if (stones >= 500) return 'S';
  if (stones >= 100) return 'A';
  return 'B';
}

export function calculateStonesRewards(
  input: StonesRewardInput,
): Readonly<Record<StonesSeat, PlayerStonesRewards>> {
  const rewards = {
    'player-one': calculatePlayerRewards(input, 'player-one'),
    'player-two': calculatePlayerRewards(input, 'player-two'),
  } as const;
  return rewards;
}

function calculatePlayerRewards(input: StonesRewardInput, seat: StonesSeat): PlayerStonesRewards {
  const opponent = seat === 'player-one' ? 'player-two' : 'player-one';
  const mainDePierreOccurrences = Math.min(
    MAIN_DE_PIERRE_CAP,
    input.rounds.filter((round) => round.winner === seat && round.choices[seat] === 0).length,
  );

  let exactPredictionStreak = 0;
  let oeilEnPierre = false;
  for (const round of input.rounds) {
    exactPredictionStreak = round.winner === seat ? exactPredictionStreak + 1 : 0;
    if (exactPredictionStreak >= 3) {
      oeilEnPierre = true;
      break;
    }
  }

  const coeurDePierre =
    input.terminalReason === 'reserve-empty' &&
    input.winner === seat &&
    input.rounds.some(
      (round) => round.reservesAfter[seat] === 3 && round.reservesAfter[opponent] === 1,
    );
  const mainDePierreStones = mainDePierreOccurrences * MAIN_DE_PIERRE_STONES;
  const oeilEnPierreStones = oeilEnPierre ? OEIL_EN_PIERRE_STONES : 0;
  const coeurDePierreStones = coeurDePierre ? COEUR_DE_PIERRE_STONES : 0;

  return {
    coeurDePierre,
    coeurDePierreStones,
    mainDePierreOccurrences,
    mainDePierreStones,
    oeilEnPierre,
    oeilEnPierreStones,
    total: mainDePierreStones + oeilEnPierreStones + coeurDePierreStones,
  };
}

function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer.`);
  }
}
