import { describe, expect, it } from 'vitest';

import { normalizePredictionValue } from './game-controls.js';

describe('prediction slider', () => {
  it('skips a forbidden value in the direction of travel', () => {
    const legalValues = [0, 1, 2, 4, 5, 6];

    expect(normalizePredictionValue(3, 2, legalValues)).toBe(4);
    expect(normalizePredictionValue(3, 4, legalValues)).toBe(2);
  });

  it('stays on the nearest legal edge when zero or six is forbidden', () => {
    expect(normalizePredictionValue(0, 1, [1, 2, 3, 4, 5, 6])).toBe(1);
    expect(normalizePredictionValue(6, 5, [0, 1, 2, 3, 4, 5])).toBe(5);
  });
});
