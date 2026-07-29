import { describe, expect, it } from 'vitest';

import {
  applyGameAction,
  createGame,
  getLegalActions,
  getPrivateObservation,
  type GameAction,
  type GameState,
  type PlayerId,
} from '@three-stone/game-core';

import {
  createSeededRandom,
  decideAction,
  difficultyProfiles,
  measurePredictionQuality,
} from './index.js';

function accept(state: GameState, action: GameAction): GameState {
  const result = applyGameAction(state, action);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.state;
}

function choicesReady(aiChoice: number, opponentChoice: number, sequenceNumber = 1): GameState {
  let state = createGame({
    gameId: `game-${aiChoice}-${opponentChoice}`,
    seed: 123,
    sequenceNumber,
  }).state;
  state = accept(state, {
    type: 'choose-hidden',
    playerId: 'player-one',
    count: aiChoice,
  });
  return accept(state, {
    type: 'choose-hidden',
    playerId: 'player-two',
    count: opponentChoice,
  });
}

describe('seeded random source', () => {
  it('reproduces the same sequence for the same seed', () => {
    const one = createSeededRandom(42);
    const two = createSeededRandom(42);

    expect(Array.from({ length: 20 }, () => one.next())).toEqual(
      Array.from({ length: 20 }, () => two.next()),
    );
  });
});

describe('AI decision port', () => {
  it.each(['easy', 'normal', 'hard'] as const)(
    '%s always returns one of the supplied legal actions',
    (difficulty) => {
      for (let seed = 0; seed < 100; seed += 1) {
        const state = createGame({
          gameId: `legality-${seed}`,
          seed,
          sequenceNumber: 1,
        }).state;
        const observation = getPrivateObservation(state, 'player-one');
        const legalActions = getLegalActions(state, 'player-one');
        const decision = decideAction({
          observation,
          legalActions,
          difficulty,
          random: createSeededRandom(seed),
        });

        expect(legalActions).toContainEqual(decision);
      }
    },
  );

  it('is deterministic for an identical seed, observation and history', () => {
    const state = createGame({
      gameId: 'determinism',
      seed: 1,
      sequenceNumber: 1,
    }).state;
    const observation = getPrivateObservation(state, 'player-one');
    const legalActions = getLegalActions(state, 'player-one');

    const decide = () =>
      decideAction({
        observation,
        legalActions,
        difficulty: 'hard',
        random: createSeededRandom(9_999),
      });

    expect(decide()).toEqual(decide());
  });

  it('cannot distinguish two current opponent secrets', () => {
    const hiddenZero = choicesReady(1, 0);
    const hiddenThree = choicesReady(1, 3);
    const zeroObservation = getPrivateObservation(hiddenZero, 'player-one');
    const threeObservation = getPrivateObservation(hiddenThree, 'player-one');

    expect(zeroObservation).toEqual(threeObservation);

    const choose = (state: GameState) =>
      decideAction({
        observation: getPrivateObservation(state, 'player-one'),
        legalActions: getLegalActions(state, 'player-one'),
        difficulty: 'hard',
        random: createSeededRandom(82),
      });
    expect(choose(hiddenZero)).toEqual(choose(hiddenThree));
  });
});

describe('difficulty calibration', () => {
  it('uses explicit progressively stronger estimation profiles', () => {
    expect(difficultyProfiles.easy.estimationQuality).toBeLessThan(
      difficultyProfiles.normal.estimationQuality,
    );
    expect(difficultyProfiles.normal.estimationQuality).toBeLessThan(
      difficultyProfiles.hard.estimationQuality,
    );
    expect(difficultyProfiles.easy.memoryRounds).toBeLessThan(difficultyProfiles.hard.memoryRounds);
  });

  it('measures increasing prediction quality without illegal actions', () => {
    const report = measurePredictionQuality({
      samples: 1_000,
      seed: 71_771,
    });

    expect(report.illegalActionCount).toBe(0);
    expect(report.byDifficulty.easy.optimalPredictionRate).toBeGreaterThan(0.1);
    expect(report.byDifficulty.normal.optimalPredictionRate).toBeGreaterThan(
      report.byDifficulty.easy.optimalPredictionRate + 0.15,
    );
    expect(report.byDifficulty.hard.optimalPredictionRate).toBeGreaterThan(
      report.byDifficulty.normal.optimalPredictionRate + 0.1,
    );
    expect(measurePredictionQuality({ samples: 1_000, seed: 71_771 })).toEqual(report);
  });

  it('finishes seeded AI games with zero illegal decisions', () => {
    for (let game = 0; game < 30; game += 1) {
      const randoms: Record<PlayerId, ReturnType<typeof createSeededRandom>> = {
        'player-one': createSeededRandom(game * 2 + 1),
        'player-two': createSeededRandom(game * 2 + 2),
      };
      let state = createGame({
        gameId: `simulation-${game}`,
        seed: game,
        sequenceNumber: game + 1,
      }).state;
      let actions = 0;

      while (state.phase !== 'finished' && actions < 2_000) {
        const candidates = (['player-one', 'player-two'] as const)
          .map((playerId) => ({
            playerId,
            legalActions: getLegalActions(state, playerId),
          }))
          .filter(({ legalActions }) => legalActions.length > 0);
        expect(candidates.length).toBeGreaterThan(0);
        const candidate = candidates[0];
        if (!candidate) {
          break;
        }
        const action = decideAction({
          observation: getPrivateObservation(state, candidate.playerId),
          legalActions: candidate.legalActions,
          difficulty: candidate.playerId === 'player-one' ? 'hard' : 'normal',
          random: randoms[candidate.playerId],
        });
        const result = applyGameAction(state, action);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          break;
        }
        state = result.state;
        actions += 1;
      }

      expect(state.phase).toBe('finished');
      expect(actions).toBeLessThan(2_000);
    }
  });
});
