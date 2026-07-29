import { describe, expect, it } from 'vitest';

import { createBoardImageMotion } from './board-image-motion.js';

describe('board image motion', () => {
  it('keeps the fitted 16:9 image scale throughout the closed-hand animation', () => {
    const motion = createBoardImageMotion({
      baseScaleX: 0.6,
      baseScaleY: 0.6,
      centerX: 480,
      centerY: 270,
    });

    expect(motion.rest).toEqual({
      x: 480,
      y: 270,
      scaleX: 0.6,
      scaleY: 0.6,
    });
    expect(motion.breathing).toEqual({
      x: 480,
      y: 273,
      scaleX: 0.6048,
      scaleY: 0.6048,
    });
  });

  it('starts and ends the reveal relative to each image fitted scale', () => {
    const closedMotion = createBoardImageMotion({
      baseScaleX: 0.6,
      baseScaleY: 0.6,
      centerX: 480,
      centerY: 270,
    });
    const openMotion = createBoardImageMotion({
      baseScaleX: 0.5,
      baseScaleY: 0.5,
      centerX: 480,
      centerY: 270,
    });

    expect(closedMotion.revealTransition).toEqual({
      x: 480,
      y: 282,
      scaleX: 0.576,
      scaleY: 0.576,
    });
    expect(openMotion.revealTransition).toEqual({
      x: 480,
      y: 282,
      scaleX: 0.48,
      scaleY: 0.48,
    });
    expect(openMotion.rest.scaleX).toBe(0.5);
    expect(openMotion.rest.scaleY).toBe(0.5);
  });
});
