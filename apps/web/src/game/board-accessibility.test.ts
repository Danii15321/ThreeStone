import { describe, expect, it } from 'vitest';

import { describeBoard } from './board-accessibility.js';
import { createBoardModel } from './board-model.js';

describe('board accessibility', () => {
  it('names both multiplayer participants in a victory description', () => {
    const description = describeBoard(
      createBoardModel({
        dropStone: null,
        pose: 'ai-victory',
        reserves: { ai: 0, human: 1 },
        reveal: null,
      }),
      'Astrid',
      'Bjorn',
    );

    expect(description).toBe(
      'Plateau de jeu. Bjorn célèbre sa victoire avec un pouce levé. Astrid a 1 caillou, Bjorn en a 0.',
    );
    expect(description).not.toContain('ordinateur');
  });

  it('describes a reveal without leaking generic solo labels', () => {
    const description = describeBoard(
      createBoardModel({
        dropStone: 'human',
        pose: 'revealed',
        reserves: { ai: 2, human: 2 },
        reveal: { choices: { ai: 1, human: 2 } },
      }),
      'Astrid',
      'Bjorn',
    );

    expect(description).toContain('1 caillou pour Bjorn et 2 pour Astrid');
  });
});
