import type {
  ChooseHiddenAction,
  GameAction,
  PlayerId,
  PredictAction,
} from '@three-stone/game-core';

import type { AiDecisionInput, Difficulty, DifficultyProfile, RandomSource } from './types.js';

export const difficultyProfiles: Readonly<Record<Difficulty, DifficultyProfile>> = {
  easy: {
    estimationQuality: 0.25,
    memoryRounds: 0,
    bluffRate: 0.3,
  },
  normal: {
    estimationQuality: 0.65,
    memoryRounds: 4,
    bluffRate: 0.15,
  },
  hard: {
    estimationQuality: 0.9,
    memoryRounds: 12,
    bluffRate: 0.05,
  },
};

export function decideAction(input: AiDecisionInput): GameAction {
  const legalActions = input.legalActions.filter(
    (action) => action.playerId === input.observation.playerId,
  );
  if (legalActions.length === 0) {
    throw new Error('The AI decision port requires at least one legal action.');
  }

  const actionType = legalActions[0]?.type;
  if (!legalActions.every((action) => action.type === actionType)) {
    throw new Error('A decision step cannot mix hidden choices and predictions.');
  }

  return actionType === 'choose-hidden'
    ? chooseHiddenAction(
        legalActions as readonly ChooseHiddenAction[],
        input.difficulty,
        input.random,
      )
    : choosePrediction(
        legalActions as readonly PredictAction[],
        input,
        difficultyProfiles[input.difficulty],
      );
}

function chooseHiddenAction(
  actions: readonly ChooseHiddenAction[],
  difficulty: Difficulty,
  random: RandomSource,
): ChooseHiddenAction {
  if (difficulty === 'easy') {
    return sample(actions, random);
  }

  // Higher levels avoid the extreme choices slightly more often. This remains
  // probabilistic and uses only the legal actions supplied by the engine.
  const weights = actions.map((action) => {
    const distanceFromMiddle = Math.abs(action.count - (actions.length - 1) / 2);
    const centerBias = difficulty === 'hard' ? 1.5 : 0.75;
    return 1 + Math.max(0, centerBias - distanceFromMiddle * 0.35);
  });
  return weightedSample(actions, weights, random);
}

function choosePrediction(
  actions: readonly PredictAction[],
  input: AiDecisionInput,
  profile: DifficultyProfile,
): PredictAction {
  const weights = predictionWeights(input, actions, profile);
  const highestWeight = Math.max(...weights);
  const optimalActions = actions.filter((_, index) => weights[index] === highestWeight);

  if (input.random.next() < profile.estimationQuality && input.random.next() >= profile.bluffRate) {
    return sample(optimalActions, input.random);
  }
  return sample(actions, input.random);
}

function predictionWeights(
  input: AiDecisionInput,
  actions: readonly PredictAction[],
  profile: DifficultyProfile,
): readonly number[] {
  const ownChoice = input.observation.ownHiddenChoice ?? 0;
  const opponent = otherPlayer(input.observation.playerId);
  const opponentReserve = input.observation.reserves[opponent];
  const choiceWeights = Array.from({ length: opponentReserve + 1 }, () => 1);
  const history =
    profile.memoryRounds === 0 ? [] : input.observation.revealedRounds.slice(-profile.memoryRounds);

  for (const round of history) {
    const historicalChoice = round.choices[opponent];
    if (historicalChoice <= opponentReserve) {
      choiceWeights[historicalChoice] = (choiceWeights[historicalChoice] ?? 0) + 3;
    }
  }

  return actions.map((action) => {
    const opponentChoice = action.value - ownChoice;
    if (opponentChoice < 0 || opponentChoice > opponentReserve) {
      return 0.01;
    }
    return choiceWeights[opponentChoice] ?? 0.01;
  });
}

function sample<T>(values: readonly T[], random: RandomSource): T {
  const index = Math.min(values.length - 1, Math.floor(random.next() * values.length));
  const value = values[index];
  if (value === undefined) {
    throw new Error('Cannot sample an empty collection.');
  }
  return value;
}

function weightedSample<T>(
  values: readonly T[],
  weights: readonly number[],
  random: RandomSource,
): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random.next() * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= weights[index] ?? 0;
    const value = values[index];
    if (cursor <= 0 && value !== undefined) {
      return value;
    }
  }
  return sample(values, random);
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'player-one' ? 'player-two' : 'player-one';
}
