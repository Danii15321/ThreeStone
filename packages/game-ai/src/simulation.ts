import {
  applyGameAction,
  createGame,
  getLegalActions,
  getPrivateObservation,
  type GameAction,
  type GameState,
  type PlayerId,
} from '@three-stone/game-core';

import { createSeededRandom } from './seeded-random.js';
import { decideAction } from './strategy.js';
import type {
  Difficulty,
  DifficultySimulationOptions,
  DifficultySimulationReport,
  DifficultySimulationResult,
  RandomSource,
} from './types.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
const MAXIMUM_ACTIONS_PER_GAME = 2_000;

export function runDifficultySimulation(
  options: DifficultySimulationOptions,
): DifficultySimulationReport {
  if (!Number.isInteger(options.gamesPerDifficulty) || options.gamesPerDifficulty < 1) {
    throw new TypeError('Simulation requires a positive integer game count.');
  }

  let illegalActionCount = 0;
  let incompleteGameCount = 0;
  const byDifficulty = {} as Record<Difficulty, DifficultySimulationResult>;

  for (const [difficultyIndex, difficulty] of DIFFICULTIES.entries()) {
    const aggregate = createAggregate();

    for (let gameIndex = 0; gameIndex < options.gamesPerDifficulty; gameIndex += 1) {
      const gameSeed = options.seed + difficultyIndex * 10_000_019 + gameIndex * 10_007;
      const aiRandom = createSeededRandom(gameSeed);
      const referenceRandom = createSeededRandom(gameSeed ^ 0x5f3759df);
      let state = createGame({
        gameId: `calibration-${difficulty}-${gameIndex}`,
        seed: gameSeed,
        sequenceNumber: gameIndex + 1,
      }).state;
      let submittedActions = 0;

      while (state.phase !== 'finished' && submittedActions < MAXIMUM_ACTIONS_PER_GAME) {
        const actor = findActor(state);
        if (actor === null) {
          incompleteGameCount += 1;
          break;
        }
        const legalActions = getLegalActions(state, actor);
        const action =
          actor === 'player-one'
            ? decideAction({
                observation: getPrivateObservation(state, actor),
                legalActions,
                difficulty,
                random: aiRandom,
              })
            : sample(legalActions, referenceRandom);

        if (actor === 'player-one') {
          if (action.type === 'choose-hidden') {
            aggregate.hiddenChoices.add(action.count);
          } else {
            aggregate.predictions.add(action.value);
          }
        }

        const result = applyGameAction(state, action);
        if (!result.ok) {
          illegalActionCount += 1;
          break;
        }
        state = result.state;
        submittedActions += 1;
      }

      if (state.phase !== 'finished') {
        incompleteGameCount += 1;
        continue;
      }
      aggregate.completedGames += 1;
      aggregate.totalRounds += state.roundNumber;
      aggregate.maximumRounds = Math.max(aggregate.maximumRounds, state.roundNumber);
      if (state.winner === 'player-one') {
        aggregate.wins += 1;
      }
    }

    byDifficulty[difficulty] = {
      games: options.gamesPerDifficulty,
      completedGames: aggregate.completedGames,
      wins: aggregate.wins,
      winRate: aggregate.completedGames === 0 ? 0 : aggregate.wins / aggregate.completedGames,
      averageRounds:
        aggregate.completedGames === 0 ? 0 : aggregate.totalRounds / aggregate.completedGames,
      maximumRounds: aggregate.maximumRounds,
      distinctHiddenChoices: aggregate.hiddenChoices.size,
      distinctPredictions: aggregate.predictions.size,
    };
  }

  return {
    seed: options.seed,
    gamesPerDifficulty: options.gamesPerDifficulty,
    illegalActionCount,
    incompleteGameCount,
    byDifficulty,
  };
}

interface SimulationAggregate {
  completedGames: number;
  wins: number;
  totalRounds: number;
  maximumRounds: number;
  readonly hiddenChoices: Set<number>;
  readonly predictions: Set<number>;
}

function createAggregate(): SimulationAggregate {
  return {
    completedGames: 0,
    wins: 0,
    totalRounds: 0,
    maximumRounds: 0,
    hiddenChoices: new Set(),
    predictions: new Set(),
  };
}

function findActor(state: GameState): PlayerId | null {
  for (const playerId of ['player-one', 'player-two'] as const) {
    if (getLegalActions(state, playerId).length > 0) {
      return playerId;
    }
  }
  return null;
}

function sample(actions: readonly GameAction[], random: RandomSource): GameAction {
  const index = Math.min(actions.length - 1, Math.floor(random.next() * actions.length));
  const action = actions[index];
  if (action === undefined) {
    throw new Error('The reference policy requires at least one legal action.');
  }
  return action;
}
