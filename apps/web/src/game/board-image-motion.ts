interface BoardImageMotionInput {
  readonly baseScaleX: number;
  readonly baseScaleY: number;
  readonly centerX: number;
  readonly centerY: number;
}

interface BoardImageTransform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

interface BoardImageMotion {
  readonly rest: BoardImageTransform;
  readonly breathing: BoardImageTransform;
  readonly revealTransition: BoardImageTransform;
}

export function createBoardImageMotion({
  baseScaleX,
  baseScaleY,
  centerX,
  centerY,
}: BoardImageMotionInput): BoardImageMotion {
  return {
    rest: {
      x: centerX,
      y: centerY,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
    },
    breathing: {
      x: centerX,
      y: centerY + 3,
      scaleX: baseScaleX * 1.008,
      scaleY: baseScaleY * 1.008,
    },
    revealTransition: {
      x: centerX,
      y: centerY + 12,
      scaleX: baseScaleX * 0.96,
      scaleY: baseScaleY * 0.96,
    },
  };
}
