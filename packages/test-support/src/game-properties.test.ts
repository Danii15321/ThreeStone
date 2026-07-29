import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  applyGameAction,
  createGame,
  getLegalActions,
  getPublicView,
  replayGame,
  validateGameState,
  type GameAction,
} from '@three-stone/game-core';

describe('generated game sequences', () => {
  it('preserves all invariants and replays every accepted history', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(fc.nat(), { minLength: 1, maxLength: 250 }),
        (seed, choices) => {
          const options = {
            gameId: `property-${seed}`,
            seed,
            sequenceNumber: Math.abs(seed % 10_000) + 1,
          };
          let state = createGame(options).state;

          for (const choice of choices) {
            const actors = ['player-one', 'player-two'] as const;
            const allLegal = actors.flatMap((playerId) => getLegalActions(state, playerId));
            if (allLegal.length === 0) {
              break;
            }
            const action = allLegal[choice % allLegal.length] as GameAction;
            const result = applyGameAction(state, action);
            expect(result.ok).toBe(true);
            if (!result.ok) {
              return false;
            }
            state = result.state;

            expect(validateGameState(state)).toEqual({ valid: true });
            expect(state.reserves['player-one']).toBeGreaterThanOrEqual(0);
            expect(state.reserves['player-one']).toBeLessThanOrEqual(3);
            expect(state.reserves['player-two']).toBeGreaterThanOrEqual(0);
            expect(state.reserves['player-two']).toBeLessThanOrEqual(3);
            expect(getPublicView(state)).not.toHaveProperty('round.hiddenChoices');
          }

          const replayed = replayGame(options, state.actionHistory);
          expect(replayed.ok).toBe(true);
          return replayed.ok && JSON.stringify(replayed.state) === JSON.stringify(state);
        },
      ),
      { numRuns: 150 },
    );
  });
});
