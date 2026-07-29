import type { GameAction, PrivateObservation } from '@three-stone/game-core';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyProfile {
  readonly estimationQuality: number;
  readonly memoryRounds: number;
  readonly bluffRate: number;
}

export interface RandomSource {
  next(): number;
}

export interface AiDecisionInput {
  readonly observation: PrivateObservation;
  readonly legalActions: readonly GameAction[];
  readonly difficulty: Difficulty;
  readonly random: RandomSource;
}

export interface CalibrationOptions {
  readonly samples: number;
  readonly seed: number;
}

export interface CalibrationDifficultyResult {
  readonly decisions: number;
  readonly optimalPredictions: number;
  readonly optimalPredictionRate: number;
}

export interface CalibrationReport {
  readonly seed: number;
  readonly samplesPerDifficulty: number;
  readonly illegalActionCount: number;
  readonly byDifficulty: Readonly<Record<Difficulty, CalibrationDifficultyResult>>;
}

export interface DifficultySimulationOptions {
  readonly gamesPerDifficulty: number;
  readonly seed: number;
}

export interface DifficultySimulationResult {
  readonly games: number;
  readonly completedGames: number;
  readonly wins: number;
  readonly winRate: number;
  readonly averageRounds: number;
  readonly maximumRounds: number;
  readonly distinctHiddenChoices: number;
  readonly distinctPredictions: number;
}

export interface DifficultySimulationReport {
  readonly seed: number;
  readonly gamesPerDifficulty: number;
  readonly illegalActionCount: number;
  readonly incompleteGameCount: number;
  readonly byDifficulty: Readonly<Record<Difficulty, DifficultySimulationResult>>;
}
