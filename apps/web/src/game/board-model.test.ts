import { describe, expect, it } from 'vitest';

import { createBoardModel } from './board-model.js';

describe('Phaser board model', () => {
  it('keeps both hands closed before the reveal while exposing only the reserves', () => {
    expect(
      createBoardModel({
        pose: 'closed',
        reveal: null,
        reserves: { ai: 2, human: 3 },
        dropStone: null,
      }),
    ).toEqual({
      pose: 'closed',
      ai: { revealedCount: 0, reserve: 2 },
      human: { revealedCount: 0, reserve: 3 },
      dropStone: null,
    });
  });

  it('opens both hands and identifies the stone discarded by the round winner', () => {
    expect(
      createBoardModel({
        pose: 'revealed',
        reveal: {
          choices: { ai: 1, human: 2 },
        },
        reserves: { ai: 2, human: 3 },
        dropStone: 'human',
      }),
    ).toEqual({
      pose: 'revealed',
      ai: { revealedCount: 1, reserve: 2 },
      human: { revealedCount: 2, reserve: 3 },
      dropStone: 'human',
    });
  });
});
