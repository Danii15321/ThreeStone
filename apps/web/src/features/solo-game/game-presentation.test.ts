import { describe, expect, it } from 'vitest';

import {
  advanceRoundPresentation,
  createRoundPresentation,
  getVisiblePredictions,
} from './game-presentation.js';

describe('solo round presentation', () => {
  it('shows the human prediction before the AI response when the human has initiative', () => {
    const presentation = createRoundPresentation({
      existingPredictions: { ai: null, human: null },
      initiative: 'human',
      reservesAfter: { ai: 3, human: 2 },
      reservesBefore: { ai: 3, human: 3 },
      reveal: {
        choices: { ai: 1, human: 2 },
        predictions: { ai: 2, human: 3 },
        total: 3,
        winner: 'human',
      },
      roundNumber: 1,
    });

    expect(presentation.stage).toBe('first-predicted');
    expect(getVisiblePredictions(presentation)).toEqual({ ai: null, human: 3 });
    expect(presentation.dropStone).toBe('human');

    const withBothPredictions = advanceRoundPresentation(presentation);
    expect(withBothPredictions?.stage).toBe('both-predicted');
    expect(getVisiblePredictions(withBothPredictions!)).toEqual({ ai: 2, human: 3 });
    expect(advanceRoundPresentation(withBothPredictions!)?.stage).toBe('revealed');
  });

  it('keeps the AI prediction visible and then reveals both predictions when the AI starts', () => {
    const presentation = createRoundPresentation({
      existingPredictions: { ai: 4, human: null },
      initiative: 'ai',
      reservesAfter: { ai: 2, human: 3 },
      reservesBefore: { ai: 2, human: 3 },
      reveal: {
        choices: { ai: 2, human: 1 },
        predictions: { ai: 4, human: 3 },
        total: 3,
        winner: 'human',
      },
      roundNumber: 2,
    });

    expect(presentation.stage).toBe('both-predicted');
    expect(getVisiblePredictions(presentation)).toEqual({ ai: 4, human: 3 });
    expect(presentation.dropStone).toBeNull();
    expect(advanceRoundPresentation(presentation)?.stage).toBe('revealed');
  });

  it('ends the sequence after the discarded-stone animation', () => {
    const presentation = createRoundPresentation({
      existingPredictions: { ai: null, human: null },
      initiative: 'human',
      reservesAfter: { ai: 3, human: 3 },
      reservesBefore: { ai: 3, human: 3 },
      reveal: {
        choices: { ai: 0, human: 0 },
        predictions: { ai: 1, human: 2 },
        total: 0,
        winner: null,
      },
      roundNumber: 3,
    });

    const both = advanceRoundPresentation(presentation)!;
    const revealed = advanceRoundPresentation(both)!;
    const resolved = advanceRoundPresentation(revealed)!;

    expect(resolved.stage).toBe('resolved');
    expect(advanceRoundPresentation(resolved)).toBeNull();
  });
});
