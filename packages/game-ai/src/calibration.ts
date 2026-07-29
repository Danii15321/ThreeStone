import type {
  GameAction,
  PlayerId,
  PrivateObservation,
  PublicRoundResult,
} from '@three-stone/game-core';

import { createSeededRandom } from './seeded-random.js';
import { decideAction } from './strategy.js';
import type {
  CalibrationDifficultyResult,
  CalibrationOptions,
  CalibrationReport,
  Difficulty,
} from './types.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;

export function measurePredictionQuality(options: CalibrationOptions): CalibrationReport {
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    throw new TypeError('Calibration requires a positive integer sample count.');
  }

  const observation = createCalibrationObservation();
  const legalActions = observation.legalActions;
  let illegalActionCount = 0;
  const byDifficulty = {} as Record<Difficulty, CalibrationDifficultyResult>;

  for (const [difficultyIndex, difficulty] of DIFFICULTIES.entries()) {
    const random = createSeededRandom(options.seed + difficultyIndex * 1_000_003);
    let optimalPredictions = 0;
    for (let sample = 0; sample < options.samples; sample += 1) {
      const action = decideAction({
        observation,
        legalActions,
        difficulty,
        random,
      });
      if (!legalActions.some((legalAction) => actionsEqual(legalAction, action))) {
        illegalActionCount += 1;
      }
      if (action.type === 'predict' && action.value === 2) {
        optimalPredictions += 1;
      }
    }
    byDifficulty[difficulty] = {
      decisions: options.samples,
      optimalPredictions,
      optimalPredictionRate: optimalPredictions / options.samples,
    };
  }

  return {
    seed: options.seed,
    samplesPerDifficulty: options.samples,
    illegalActionCount,
    byDifficulty,
  };
}

function createCalibrationObservation(): PrivateObservation {
  const playerId: PlayerId = 'player-one';
  const history: PublicRoundResult[] = Array.from({ length: 12 }, (_, index) => {
    const opponentChoice = index < 10 ? 1 : index - 10;
    return {
      roundNumber: index + 1,
      choices: { 'player-one': 1, 'player-two': opponentChoice },
      predictions: { 'player-one': 5, 'player-two': 6 },
      total: 1 + opponentChoice,
      winner: null,
    };
  });
  const legalActions: readonly GameAction[] = Array.from({ length: 7 }, (_, value) => ({
    type: 'predict',
    playerId,
    value,
  }));
  return {
    playerId,
    rulesVersion: '1.0.0',
    phase: 'first-prediction',
    roundNumber: 13,
    initiative: playerId,
    reserves: { 'player-one': 3, 'player-two': 3 },
    choicesReceived: { 'player-one': true, 'player-two': true },
    predictions: {},
    revealedRounds: history,
    winner: null,
    ownHiddenChoice: 1,
    legalActions,
  };
}

function actionsEqual(left: GameAction, right: GameAction): boolean {
  return left.type === right.type && JSON.stringify(left) === JSON.stringify(right);
}
