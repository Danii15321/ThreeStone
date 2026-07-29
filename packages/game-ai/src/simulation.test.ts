import { describe, expect, it } from 'vitest';

import { runDifficultySimulation } from './index.js';

describe('seeded full-game calibration', () => {
  it('measures legality, completion, duration, diversity and relative strength', () => {
    const options = { gamesPerDifficulty: 80, seed: 2_026_072_9 };
    const report = runDifficultySimulation(options);

    expect(report).toEqual(runDifficultySimulation(options));
    expect(report.illegalActionCount).toBe(0);
    expect(report.incompleteGameCount).toBe(0);

    for (const result of Object.values(report.byDifficulty)) {
      expect(result.completedGames).toBe(options.gamesPerDifficulty);
      expect(result.averageRounds).toBeGreaterThanOrEqual(3);
      expect(result.maximumRounds).toBeLessThan(200);
      expect(result.distinctHiddenChoices).toBeGreaterThanOrEqual(3);
      expect(result.distinctPredictions).toBeGreaterThanOrEqual(5);
    }

    expect(report.byDifficulty.hard.winRate).toBeGreaterThan(report.byDifficulty.easy.winRate);
  });
});
